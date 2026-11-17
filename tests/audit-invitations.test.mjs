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
  "VULN-001 : invitation après révocation, interleaving HTTP déterministe",
  { skip: !process.env.RUN_DB_TESTS },
  async (t) => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString);

    const schema = `test_audit_${randomBytes(8).toString("hex")}`;
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

    const expected =
      process.env.AUDIT_EXPECT === "vulnerable" ? "vulnerable" : "fixed";
    t.diagnostic(
      JSON.stringify({
        mode: expected,
        node: process.version,
        executedAt: new Date().toISOString(),
        serviceSha256: createHash("sha256")
          .update(await readFile("src/services/invitations.service.ts"))
          .digest("hex"),
      }),
    );
    const password = "Mot de passe temporaire audit uniquement!";
    const passwordHash = await hashPassword(password);
    const root = await db.user.create({
      data: {
        email: "root@audit.test",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        passwordHash,
      },
    });
    const mailbox = [];
    let gate;
    // Crochet de test seulement : suspend APRÈS les middlewares, AVANT la transaction.
    // Il ne change aucune règle applicative ni aucune donnée de la requête.
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
    function pauseNextTransaction() {
      let reached, release;
      const ready = new Promise((resolve) => {
        reached = resolve;
      });
      const resume = new Promise((resolve) => {
        release = resolve;
      });
      gate = { reached, resume };
      return { ready, release };
    }
    server = createApp(
      instrumented,
      randomBytes(32).toString("hex"),
      async (mail) => {
        mailbox.push(mail);
        return { status: "accepted" };
      },
    ).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, method = "GET", body, token) =>
      fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    async function login(email) {
      const response = await request("/auth/login", "POST", {
        email,
        password,
      });
      assert.equal(response.status, 200);
      return response.json();
    }
    const rootSession = await login(root.email);
    for (const endpoint of ["create", "resend"]) {
      for (const revocation of ["disabled", "demoted", "logout"]) {
        const actor = await db.user.create({
          data: {
            email: `${endpoint}-${revocation}@audit.test`,
            role: "SUPER_ADMIN",
            status: "ACTIVE",
            passwordHash,
          },
        });
        const session = await login(actor.email);
        const email = `destination-${endpoint}-${revocation}@audit.test`;
        let target;
        if (endpoint === "resend")
          target = await db.user.create({
            data: { email, role: "SUPER_ADMIN", status: "INVITED" },
          });
        const beforeMail = mailbox.length;
        const beforeAudit = await db.auditLog.count({
          where: {
            actorId: actor.id,
            action: { in: ["USER_INVITED", "INVITATION_REISSUED"] },
          },
        });
        const pause = pauseNextTransaction();
        const pending = request(
          endpoint === "create" ? "/users" : `/users/${target.id}/invitation`,
          "POST",
          endpoint === "create" ? { email, role: "SUPER_ADMIN" } : {},
          session.accessToken,
        );
        let response;
        try {
          await Promise.race([
            pause.ready,
            pending.then((r) => {
              throw new Error(`Transaction non atteinte : HTTP ${r.status}`);
            }),
          ]);
          const revoked =
            revocation === "logout"
              ? await request("/auth/logout", "POST", {
                  refreshToken: session.refreshToken,
                })
              : await request(
                  `/users/${actor.id}/${revocation === "disabled" ? "status" : "role"}`,
                  "PATCH",
                  revocation === "disabled"
                    ? { status: "DISABLED" }
                    : { role: "USER" },
                  rootSession.accessToken,
                );
          assert.equal(revoked.status, revocation === "logout" ? 204 : 200);
          // Une NOUVELLE requête échoue bien : le défaut concerne celle déjà en vol.
          assert.equal(
            (await request("/auth/me", "GET", undefined, session.accessToken))
              .status,
            401,
          );
        } finally {
          pause.release();
          response = await pending;
        }
        const found = await db.user.findUnique({ where: { email } });
        const invitations = found
          ? await db.invitation.count({ where: { userId: found.id } })
          : 0;
        const mailCount = mailbox.length - beforeMail;
        const auditCount =
          (await db.auditLog.count({
            where: {
              actorId: actor.id,
              action: { in: ["USER_INVITED", "INVITATION_REISSUED"] },
            },
          })) - beforeAudit;
        t.diagnostic(
          JSON.stringify({
            endpoint,
            revocation,
            http: response.status,
            destinationExists: !!found,
            activeCodes: invitations,
            emailsCaptured: mailCount,
            auditWrites: auditCount,
          }),
        );
        if (expected === "vulnerable") {
          assert.equal(response.status, endpoint === "create" ? 201 : 200);
          assert.equal(found.role, "SUPER_ADMIN");
          assert.equal(invitations, 1);
          assert.equal(mailCount, 1);
          assert.equal(auditCount, 1);
          // Démonstration complète sur un cas, avec boîte email SIMULÉE contrôlée par le test.
          if (endpoint === "create" && revocation === "disabled") {
            const token = mailbox
              .at(-1)
              .text.match(/\n([A-Za-z0-9_-]{43})\n/)[1];
            const accepted = await request("/auth/accept-invitation", "POST", {
              token,
              password,
              confirmPassword: password,
            });
            assert.equal(accepted.status, 200);
            const elevated = await login(email);
            const me = await request(
              "/auth/me",
              "GET",
              undefined,
              elevated.accessToken,
            );
            const account = await me.json();
            assert.equal(account.role, "SUPER_ADMIN");
            assert.equal(account.status, "ACTIVE");
            t.diagnostic(
              "IMPACT_CONFIRME : nouveau SUPER_ADMIN ACTIVE après désactivation de son créateur ; HTTP /auth/me=200.",
            );
          }
        } else {
          assert.equal(response.status, 403);
          assert.equal(
            endpoint === "create" ? found : found.status,
            endpoint === "create" ? null : "INVITED",
          );
          assert.equal(invitations, 0);
          assert.equal(mailCount, 0);
          assert.equal(auditCount, 0);
        }
      }
    }
  },
);
