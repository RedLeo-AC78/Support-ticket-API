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
  "PISTE-003 : traçabilité des changements de statut de ticket",
  { skip: !process.env.RUN_DB_TESTS },
  async (t) => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString);

    const schema = `test_ticket_audit_${randomBytes(8).toString("hex")}`;
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

    const password = "Phrase de test audit des tickets!";
    const passwordHash = await hashPassword(password);
    const owner = await db.user.create({
      data: { email: "owner@audit.test", passwordHash, status: "ACTIVE" },
    });
    const agent = await db.user.create({
      data: {
        email: "agent@audit.test",
        passwordHash,
        status: "ACTIVE",
        role: "AGENT",
      },
    });
    const ticket = await db.ticket.create({
      data: {
        title: "Ticket fictif",
        description: "Vérification de traçabilité",
        ownerId: owner.id,
      },
    });
    server = createApp(db, randomBytes(32).toString("hex"), async () => ({
      status: "accepted",
    })).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: agent.email, password }),
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    const beforeLogs = await db.auditLog.count();
    const response = await fetch(base + `/tickets/${ticket.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ status: "CLOSED" }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, "CLOSED");
    const stored = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    assert.equal(stored.status, "CLOSED");
    const logs = await db.auditLog.findMany({
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
        actorRole: agent.role,
        http: response.status,
        statusBefore: ticket.status,
        statusAfter: stored.status,
        auditCountBefore: beforeLogs,
        auditCountAfter: await db.auditLog.count(),
        matchingAuditRows: logs.length,
      }),
    );
    assert.equal(logs.length, mode === "fixed" ? 1 : 0);
    if (mode === "fixed") {
      assert.equal(logs[0].actorId, agent.id);
      assert.equal(logs[0].before, "OPEN");
      assert.equal(logs[0].after, "CLOSED");

      // Vérifier les refus avec un utilisateur propriétaire dépourvu du droit de traitement.
      const ownerLogin = await fetch(base + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: owner.email, password }),
      });
      assert.equal(ownerLogin.status, 200);
      const ownerSession = await ownerLogin.json();
      const denied = await fetch(base + `/tickets/${ticket.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerSession.accessToken}`,
        },
        body: JSON.stringify({ status: "OPEN" }),
      });
      assert.equal(denied.status, 403);
      await denied.body.cancel();
      assert.equal(await db.auditLog.count(), 1);

      // Contrainte volontairement défaillante, uniquement dans le schéma aléatoire de test.
      await db.$executeRawUnsafe(
        `ALTER TABLE "${schema}"."AuditLog" ADD CONSTRAINT reject_status_audit CHECK (action <> 'TICKET_STATUS_CHANGED') NOT VALID`,
      );
      const stateBeforeFailure = await db.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      const failed = await fetch(base + `/tickets/${ticket.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ status: "OPEN" }),
      });
      const failureBody = await failed.json();
      const stateAfterFailure = await db.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      const auditRowsAfterFailure = await db.auditLog.count();
      t.diagnostic(
        JSON.stringify({
          check: "audit_atomicity_and_permissions",
          userAttemptHttp: denied.status,
          auditFailureHttp: failed.status,
          code: failureBody.code,
          statusBeforeFailure: stateBeforeFailure.status,
          statusAfterFailure: stateAfterFailure.status,
          revisionUnchanged:
            stateBeforeFailure.revision === stateAfterFailure.revision,
          auditRowsAfterFailure,
        }),
      );
      assert.equal(failed.status, 500);
      assert.equal(stateAfterFailure.status, "CLOSED");
      assert.equal(stateAfterFailure.revision, stateBeforeFailure.revision);
      assert.equal(auditRowsAfterFailure, 1);
    }
  },
);
