import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../dist/generated/prisma/client.js";

import { createApp } from "../dist/app.js";

import { hashPassword, digest } from "../dist/utils/security.js";

test(
  "R1 : révocation avant modification de statut de ticket",
  { skip: !process.env.RUN_DB_TESTS },
  async (t) => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString);

    const schema = `test_revoke_ticket_${randomBytes(8).toString("hex")}`;
    const admin = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema }),
    });

    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);

    let server;

    t.after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));

      await db.$disconnect();

      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);

      await admin.$disconnect();
    });

    for (const name of (await readdir("prisma/migrations"))
      .filter((n) => /^\d/.test(n))
      .sort()) {
      const sql = await readFile(
        `prisma/migrations/${name}/migration.sql`,
        "utf8",
      );

      await admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);

        for (const statement of sql.split(";").filter((s) => s.trim()))
          await tx.$executeRawUnsafe(statement);
      });
    }

    const password = "Phrase de test révocation uniquement!";
    const passwordHash = await hashPassword(password);
    const root = await db.user.create({
      data: {
        email: "root@audit.test",
        passwordHash,
        status: "ACTIVE",
        role: "SUPER_ADMIN",
      },
    });
    const agent = await db.user.create({
      data: {
        email: "agent@audit.test",
        passwordHash,
        status: "ACTIVE",
        role: "AGENT",
      },
    });
    const owner = await db.user.create({
      data: { email: "owner@audit.test", status: "ACTIVE" },
    });
    const ticket = await db.ticket.create({
      data: {
        title: "Ticket fictif",
        description: "Test de révocation",
        ownerId: owner.id,
      },
    });
    let gate;
    const instrumented = new Proxy(db, {
      get(target, property) {
        if (property === "$transaction")
          return async (...args) => {
            const current = gate;
            if (current) {
              gate = undefined;
              current.reached();
              await current.resume;
            }
            return target.$transaction(...args);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    server = createApp(
      instrumented,
      randomBytes(32).toString("hex"),
      async () => ({ status: "accepted" }),
    ).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (url, method = "GET", body, token) =>
      fetch(base + url, {
        method,
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    async function login(user) {
      const r = await request("/auth/login", "POST", {
        email: user.email,
        password,
      });
      assert.equal(r.status, 200);
      return r.json();
    }
    const rootSession = await login(root),
      agentSession = await login(agent);
    let reached, release;
    const ready = new Promise((resolve) => {
      reached = resolve;
    });
    const resume = new Promise((resolve) => {
      release = resolve;
    });
    gate = { reached, resume };
    const pending = request(
      `/tickets/${ticket.id}/status`,
      "PATCH",
      { status: "CLOSED" },
      agentSession.accessToken,
    );
    let response;
    try {
      await Promise.race([
        ready,
        new Promise((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Point de pause non atteint")),
            10000,
          );
          timer.unref();
        }),
      ]);
      const revoke = await request(
        `/users/${agent.id}/status`,
        "PATCH",
        { status: "DISABLED" },
        rootSession.accessToken,
      );
      assert.equal(revoke.status, 200);
      await revoke.body.cancel();
      const me = await request(
        "/auth/me",
        "GET",
        undefined,
        agentSession.accessToken,
      );
      assert.equal(me.status, 401);
      await me.body.cancel();
      release();
      response = await pending;
    } finally {
      release();
    }
    const body = await response.json();
    const stored = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    const auditCount = await db.auditLog.count({
      where: {
        targetType: "TICKET",
        targetId: ticket.id,
        action: "TICKET_STATUS_CHANGED",
      },
    });
    const mode =
      process.env.AUDIT_EXPECT === "vulnerable" ? "vulnerable" : "fixed";
    t.diagnostic(
      JSON.stringify({
        executedAt: new Date().toISOString(),
        mode,
        repositorySha256: createHash("sha256")
          .update(await readFile("src/repositories/tickets.repository.ts"))
          .digest("hex"),
        revokedAgentMeHttp: 401,
        pendingOperationHttp: response.status,
        statusBefore: ticket.status,
        statusAfter: stored.status,
        ticketAuditRows: auditCount,
        errorCode: body.code ?? null,
      }),
    );
    assert.equal(response.status, mode === "fixed" ? 403 : 200);
    assert.equal(stored.status, mode === "fixed" ? "OPEN" : "CLOSED");
    assert.equal(auditCount, mode === "fixed" ? 0 : 1);
  },
);
