import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../dist/generated/prisma/client.js";

import { ticketAiService } from "../dist/services/ticket-ai.service.js";

import { ticketsRepository } from "../dist/repositories/tickets.repository.js";

import { createApp } from "../dist/app.js";

import { hashPassword, digest } from "../dist/utils/security.js";

test(
  "PostgreSQL : IA, confirmation, visibilité, pannes et concurrence",
  { skip: !process.env.RUN_DB_TESTS },
  async (t) => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString);

    const schema = `test_ai_${randomBytes(8).toString("hex")}`;
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

    const password = "Phrase de test IA assez longue!";
    const passwordHash = await hashPassword(password);
    const users = {};

    for (const name of ["owner", "other", "admin", "agent"]) {
      users[name] = await db.user.create({
        data: {
          email: name + "@example.test",
          passwordHash,
          status: "ACTIVE",
          role:
            name === "admin"
              ? "SUPER_ADMIN"
              : name === "agent"
                ? "AGENT"
                : "USER",
        },
      });
    }

    let calls = 0;
    let fail = true;
    const provider = {
      name: "fake",
      model: "fake-model",
      async analyze(ticket) {
        calls++;

        if (ticket.title === "failure" && fail)
          throw new Error("sensitive provider error");

        if (ticket.title === "invalid") return { status: "RESOLVED" };

        if (ticket.title === "offtopic")
          return {
            classification: "OFF_TOPIC",
            answer: "Réponse à ne pas publier",
            reason: "Sans rapport",
            requiresHuman: false,
          };

        if (ticket.title === "uncertain")
          return {
            classification: "IT_SUPPORT",
            answer: "Brouillon à ne pas publier",
            reason: "Précisions nécessaires",
            requiresHuman: true,
          };

        return {
          classification: "IT_SUPPORT",
          answer: "Vérifiez le Wi-Fi.",
          reason: "Réseau",
          requiresHuman: false,
        };
      },
    };

    server = createApp(
      db,
      randomBytes(32).toString("hex"),
      async () => ({ status: "accepted" }),
      provider,
    ).listen(0, "127.0.0.1");

    await once(server, "listening");

    const base = "http://127.0.0.1:" + server.address().port;

    const request = (path, method = "GET", body, token) =>
      fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    const sessions = {};

    for (const [name, user] of Object.entries(users))
      sessions[name] = await (
        await request("/auth/login", "POST", { email: user.email, password })
      ).json();

    const owner = sessions.owner.accessToken;
    const adminToken = sessions.admin.accessToken;

    async function create(title, description = "Le Wi-Fi ne fonctionne pas.") {
      const res = await request(
        "/tickets",
        "POST",
        { title, description },
        owner,
      );

      assert.equal(res.status, 201);

      return res.json();
    }

    const ticket = await create("support");

    assert.equal(ticket.status, "OPEN");

    assert.equal(ticket.ai.state, "ANSWERED");

    assert.equal(ticket.ai.answer, "Vérifiez le Wi-Fi.");

    assert.equal(ticket.ai.promptVersion, "support-v1");

    assert.equal(
      (
        await request(
          "/tickets/" + ticket.id,
          "GET",
          undefined,
          sessions.other.accessToken,
        )
      ).status,
      404,
    );

    assert.equal(
      (
        await request(
          "/tickets/" + ticket.id + "/ai/feedback",
          "POST",
          { resolved: true },
          sessions.other.accessToken,
        )
      ).status,
      404,
    );

    assert.equal(
      (
        await request(
          "/tickets/" + ticket.id + "/ai/feedback",
          "POST",
          { resolved: true },
          adminToken,
        )
      ).status,
      403,
    );

    assert.equal(
      (
        await request(
          "/tickets/" + ticket.id + "/ai/feedback",
          "POST",
          { resolved: "true" },
          owner,
        )
      ).status,
      400,
    );

    assert.equal(
      (await request("/tickets/" + ticket.id + "/ai/retry", "POST", {}, owner))
        .status,
      403,
    );

    const confirms = await Promise.all(
      [1, 2].map(() =>
        request(
          "/tickets/" + ticket.id + "/ai/feedback",
          "POST",
          { resolved: true },
          owner,
        ),
      ),
    );

    assert.deepEqual(confirms.map((r) => r.status).sort(), [200, 409]);

    const confirmed = await confirms.find((r) => r.status === 200).json();

    assert.equal(confirmed.status, "RESOLVED");

    assert.equal(confirmed.ai.state, "CONFIRMED");

    assert.equal(
      await db.auditLog.count({
        where: {
          targetType: "TICKET",
          targetId: ticket.id,
          action: "TICKET_AI_CONFIRMED",
        },
      }),
      1,
    );

    const declined = await create("declined");
    const decline = await request(
      "/tickets/" + declined.id + "/ai/feedback",
      "POST",
      { resolved: false },
      owner,
    );

    assert.equal(decline.status, 200);

    assert.equal((await decline.json()).status, "IN_PROGRESS");

    assert.equal(
      (await db.ticketAi.findUnique({ where: { ticketId: declined.id } }))
        .state,
      "NEEDS_REVIEW",
    );

    const off = await create("offtopic");

    assert.equal(off.ai.state, "OFF_TOPIC");

    assert.equal(off.ai.answer, null);

    assert.equal(off.status, "OPEN");

    const filtered = await (
      await request("/tickets?aiState=OFF_TOPIC", "GET", undefined, owner)
    ).json();

    assert.deepEqual(
      filtered.data.map((t) => t.id),
      [off.id],
    );

    assert.equal(
      (
        await (
          await request(
            "/tickets?aiState=OFF_TOPIC",
            "GET",
            undefined,
            sessions.other.accessToken,
          )
        ).json()
      ).meta.total,
      0,
    );

    const uncertain = await create("uncertain");

    assert.equal(uncertain.ai.state, "NEEDS_REVIEW");

    assert.equal(uncertain.ai.answer, null);

    assert.equal((await create("invalid")).ai.state, "FAILED");

    const beforeSecret = calls;
    const sensitive = await create("secret", "password=very-sensitive-test");

    assert.equal(sensitive.ai.state, "NEEDS_REVIEW");

    assert.equal(calls, beforeSecret);

    const failed = await create("failure");

    assert.equal(failed.status, "OPEN");

    assert.equal(failed.ai.state, "FAILED");

    assert.equal(
      JSON.stringify(failed.ai).includes("sensitive provider error"),
      false,
    );

    fail = false;

    const retry = await request(
      "/tickets/" + failed.id + "/ai/retry",
      "POST",
      {},
      adminToken,
    );

    assert.equal(retry.status, 200);

    const retried = await retry.json();

    assert.equal(retried.ai.state, "ANSWERED");

    assert.equal(retried.ai.attempts, 2);

    assert.equal(
      (
        await request(
          "/tickets/" + failed.id + "/ai/retry",
          "POST",
          {},
          adminToken,
        )
      ).status,
      409,
    );

    // Une modification humaine pendant l'appel rend le résultat IA obsolète.
    const pending = await db.ticket.create({
      data: { title: "pending", description: "x", ownerId: users.owner.id },
    });
    let release, started;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const slow = ticketAiService(db, {
      name: "fake",
      model: "slow",
      async analyze() {
        started();

        await gate;

        return {
          classification: "IT_SUPPORT",
          answer: "Réponse tardive",
          reason: "Test",
          requiresHuman: false,
        };
      },
    });
    const job = slow.analyze(String(pending.id), users.admin);

    await ready;

    await assert.rejects(
      slow.analyze(String(pending.id), users.admin),
      (e) => e.status === 409,
    );

    await ticketsRepository(db).updateStatus(
      pending.id,
      {},
      "CLOSED",
      users.admin.id,
      (
        await db.session.findFirstOrThrow({
          where: { userId: users.admin.id, revokedAt: null },
        })
      ).id,
    );

    release();

    await job;

    const final = await db.ticket.findUnique({
      where: { id: pending.id },
      include: { ai: true },
    });

    assert.equal(final.status, "CLOSED");

    assert.equal(final.ai.state, "NEEDS_REVIEW");

    assert.equal(final.ai.answer, null);

    // Après un crash : PROCESSING périmé peut être repris, pas indéfiniment.
    const crashed = await db.ticket.create({
      data: { title: "crash", description: "x", ownerId: users.owner.id },
    });

    await db.ticketAi.create({
      data: {
        ticketId: crashed.id,
        state: "PROCESSING",
        reason: "x",
        provider: "fake",
        model: "fake",
        promptVersion: "old",
        attemptId: "old",
        ticketRevision: 0,
        updatedAt: new Date(0),
      },
    });

    const service = ticketAiService(db, provider);
    const legacy = await db.ticket.create({
      data: { title: "Historique", description: "Sans propriétaire" },
    });
    const beforeLegacy = calls;

    await assert.rejects(
      service.analyze(String(legacy.id), users.agent),
      (error) => error.status === 404,
    );

    assert.equal(calls, beforeLegacy);

    assert.equal(
      (await service.analyze(String(crashed.id), users.admin)).ai.state,
      "ANSWERED",
    );

    await db.ticketAi.update({
      where: { ticketId: crashed.id },
      data: { state: "FAILED", attempts: 3 },
    });

    await assert.rejects(
      service.analyze(String(crashed.id), users.admin),
      (e) => e.status === 409,
    );

    // Audit et résolution doivent être atomiques.
    const atomic = await create("atomic");

    await db.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."AuditLog" ADD CONSTRAINT reject_confirmation CHECK (action <> 'TICKET_AI_CONFIRMED') NOT VALID`,
    );

    assert.equal(
      (
        await request(
          "/tickets/" + atomic.id + "/ai/feedback",
          "POST",
          { resolved: true },
          owner,
        )
      ).status,
      500,
    );

    assert.equal(
      (await db.ticket.findUnique({ where: { id: atomic.id } })).status,
      "OPEN",
    );

    assert.equal(
      (await db.ticketAi.findUnique({ where: { ticketId: atomic.id } })).state,
      "ANSWERED",
    );

    await db.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."AuditLog" DROP CONSTRAINT reject_confirmation`,
    );

    // Couper le fournisseur n'empêche pas de confirmer une proposition existante.
    const disabled = ticketAiService(db, null);

    await assert.rejects(
      disabled.analyze(String(atomic.id), users.admin),
      (e) => e.status === 503,
    );

    assert.equal(
      (
        await disabled.feedback(
          String(atomic.id),
          { resolved: true },
          users.owner,
        )
      ).status,
      "RESOLVED",
    );

    assert.ok(
      !(await db.auditLog.findMany({ where: { targetType: "TICKET" } })).some(
        (log) => JSON.stringify(log).includes("very-sensitive-test"),
      ),
    );
  },
);
