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
  "PISTE-002 : quota email consommé par des mots de passe invalides",
  { skip: !process.env.RUN_DB_TESTS },
  async (t) => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString);

    const schema = `test_quota_${randomBytes(8).toString("hex")}`;
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

    const password = "Phrase de test uniquement pour audit!";
    const email = "quota-victim@audit.test";
    await db.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
      },
    });
    server = createApp(db, randomBytes(32).toString("hex"), async () => ({
      status: "accepted",
    })).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = (input) =>
      fetch(base + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: input }),
      });
    const before = await login(password);
    assert.equal(before.status, 200);
    await before.body.cancel();
    const malformed = [];
    // Le succès initial a consommé une des dix unités de quota email.
    for (let i = 0; i < 9; i++) {
      const r = await login("x");
      malformed.push(r.status);
      await r.body.cancel();
    }
    assert.deepEqual(malformed, Array(9).fill(400));
    const after = await login(password);
    const body = await after.json();
    const expected = process.env.AUDIT_EXPECT === "vulnerable" ? 429 : 200;
    t.diagnostic(
      JSON.stringify({
        executedAt: new Date().toISOString(),
        mode: process.env.AUDIT_EXPECT ?? "fixed",
        routeSha256: createHash("sha256")
          .update(await readFile("src/routes/auth.routes.ts"))
          .digest("hex"),
        baseline: before.status,
        invalidRequests: malformed,
        legitimateLoginAfter: after.status,
        retryAfter: after.headers.get("retry-after"),
        code: body.code ?? "SUCCESS",
      }),
    );
    assert.equal(after.status, expected);
    // Une seule clé email utilisée, 11 requêtes seulement : le quota IP (30) ne doit pas expliquer le refus.
    const sessions = await db.session.count();
    assert.equal(sessions, expected === 429 ? 1 : 2);

    if (expected === 200) {
      // Deux connexions correctes ont consommé 2 unités du quota email (sur 10).
      // Les 9 saisies trop courtes n'ont rien consommé. Il reste donc 8 tentatives.
      const wrongPasswordStatuses = [];
      for (let i = 0; i < 8; i++) {
        const response = await login("Autre phrase longue mais incorrecte!");
        wrongPasswordStatuses.push(response.status);
        await response.body.cancel();
      }
      assert.deepEqual(wrongPasswordStatuses, Array(8).fill(401));

      const blocked = await login(password);
      const blockedBody = await blocked.json();
      t.diagnostic(
        JSON.stringify({
          check: "email_quota_preserved",
          wrongPasswordStatuses,
          correctPasswordAfterQuota: blocked.status,
          code: blockedBody.code,
          retryAfter: blocked.headers.get("retry-after"),
          totalRequests: 20,
        }),
      );
      assert.equal(blocked.status, 429);
      assert.equal(blockedBody.code, "TOO_MANY_REQUESTS");
      assert.ok(Number(blocked.headers.get("retry-after")) > 0);
      assert.equal(await db.session.count(), 2);
      // 20 requêtes au total, sous le quota IP de 30 : refus attribué au quota email.
    }
  },
);
