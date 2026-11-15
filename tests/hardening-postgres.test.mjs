import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../dist/generated/prisma/client.js";

import { createApp } from "../dist/app.js";

import { hashPassword, digest } from "../dist/utils/security.js";

test(
  "PostgreSQL : pagination, filtres, audit atomique et changements de rôle",
  { skip: !process.env.RUN_DB_TESTS },
  async (t) => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString);

    const schema = `test_hardening_${randomBytes(8).toString("hex")}`;
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

    const password = "Phrase de test longue pour la sécurité!";
    const passwordHash = await hashPassword(password);
    const users = {};

    for (const role of ["SUPER_ADMIN", "ADMIN", "AGENT", "USER"]) {
      users[role] = await db.user.create({
        data: {
          email: role.toLowerCase() + "@example.test",
          role,
          status: "ACTIVE",
          passwordHash,
        },
      });
    }

    const other = await db.user.create({
      data: { email: "other@example.test", status: "ACTIVE", passwordHash },
    });
    const owned = [];

    for (let i = 0; i < 5; i++)
      owned.push(
        await db.ticket.create({
          data: {
            title: "Identique",
            description: "ordinateur école " + i,
            ownerId: users.USER.id,
            status: i < 3 ? "OPEN" : "CLOSED",
          },
        }),
      );

    const hidden = await db.ticket.create({
      data: {
        title: "Identique",
        description: "ordinateur privé",
        ownerId: other.id,
      },
    });

    await db.ticket.create({
      data: { title: "Historique", description: "Sans propriétaire" },
    });

    server = createApp(db, randomBytes(32).toString("hex"), async () => ({
      status: "accepted",
    })).listen(0, "127.0.0.1");

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

    async function login(role) {
      const response = await request("/auth/login", "POST", {
        email: users[role].email,
        password,
      });

      assert.equal(response.status, 200);

      return response.json();
    }

    const sessions = {};

    for (const role of Object.keys(users)) sessions[role] = await login(role);

    const root = sessions.SUPER_ADMIN.accessToken;
    const userList = await (
      await request("/users?limit=2", "GET", undefined, root)
    ).json();

    assert.equal(userList.data.length, 2);

    assert.equal(userList.meta.total, 5);

    assert.ok(userList.data.every((user) => user.passwordHash === undefined));

    async function page(query, role = "USER") {
      const response = await request(
        "/tickets?" + query,
        "GET",
        undefined,
        sessions[role].accessToken,
      );

      assert.equal(response.status, 200);

      return response.json();
    }

    const first = await page("limit=2&sortBy=title&order=asc");
    const second = await page("limit=2&page=2&sortBy=title&order=asc");

    assert.deepEqual(first.meta, {
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });

    assert.deepEqual(
      first.data.map((x) => x.id),
      owned.slice(0, 2).map((x) => x.id),
    );

    assert.deepEqual(
      second.data.map((x) => x.id),
      owned.slice(2, 4).map((x) => x.id),
    );

    assert.equal((await page("status=OPEN&search=ORDINATEUR")).meta.total, 3);

    assert.equal((await page("page=20")).data.length, 0);

    assert.equal((await page("", "AGENT")).meta.total, 6);

    assert.equal((await page("", "ADMIN")).meta.total, 7);

    assert.equal(
      (await page("search=" + encodeURIComponent("' OR 1=1 --"))).meta.total,
      0,
    );

    assert.equal(await db.ticket.count(), 7);

    for (const query of [
      "ownerId=" + other.id,
      "limit=101",
      "page=0",
      "sortBy=id;DROP TABLE Ticket",
      "status=ROOT",
      "page=1&page=2",
    ])
      assert.equal(
        (
          await request(
            "/tickets?" + query,
            "GET",
            undefined,
            sessions.USER.accessToken,
          )
        ).status,
        400,
      );

    assert.equal(
      (
        await request(
          "/tickets/" + hidden.id,
          "GET",
          undefined,
          sessions.USER.accessToken,
        )
      ).status,
      404,
    );

    for (const role of ["USER", "ADMIN", "AGENT"]) {
      assert.equal(
        (
          await request(
            "/users/audit-logs",
            "GET",
            undefined,
            sessions[role].accessToken,
          )
        ).status,
        403,
      );

      assert.equal(
        (
          await request(
            "/users/" + other.id + "/role",
            "PATCH",
            { role: "ADMIN" },
            sessions[role].accessToken,
          )
        ).status,
        403,
      );
    }

    assert.equal(await db.auditLog.count(), 0);

    assert.equal(
      (
        await request(
          "/users/" + users.SUPER_ADMIN.id + "/role",
          "PATCH",
          { role: "ADMIN" },
          root,
        )
      ).status,
      409,
    );

    assert.equal(
      (
        await request(
          "/users/" + other.id + "/role",
          "PATCH",
          { role: "ROOT" },
          root,
        )
      ).status,
      400,
    );

    const target = users.USER.id;

    assert.equal(
      (
        await request(
          "/users/" + target + "/role",
          "PATCH",
          { role: "AGENT" },
          root,
        )
      ).status,
      200,
    );

    assert.equal(
      (await request("/auth/me", "GET", undefined, sessions.USER.accessToken))
        .status,
      401,
    );

    assert.equal(
      (
        await request("/auth/refresh", "POST", {
          refreshToken: sessions.USER.refreshToken,
        })
      ).status,
      401,
    );

    let audit = await db.auditLog.findFirst({ where: { targetId: target } });

    assert.equal(audit.actorId, users.SUPER_ADMIN.id);

    assert.equal(audit.action, "USER_ROLE_CHANGED");

    assert.equal(audit.before, "USER");

    assert.equal(audit.after, "AGENT");

    assert.equal(
      (
        await request(
          "/users/" + target + "/status",
          "PATCH",
          { status: "DISABLED" },
          root,
        )
      ).status,
      200,
    );

    assert.equal(
      (
        await request(
          "/users/" + target + "/status",
          "PATCH",
          { status: "ACTIVE" },
          root,
        )
      ).status,
      200,
    );

    const logResponse = await request(
      "/users/audit-logs?limit=2",
      "GET",
      undefined,
      root,
    );

    assert.equal(logResponse.status, 200);

    const logs = await logResponse.json();

    assert.equal(logs.meta.total, 3);

    assert.equal(logs.data.length, 2);

    assert.equal(logs.data[0].before, "DISABLED");

    assert.equal(logs.data[0].after, "ACTIVE");

    assert.ok(!JSON.stringify(logs).includes(passwordHash));

    const fresh = await login("USER");

    // Simuler un stockage d'audit défaillant DANS LE SCHÉMA DE TEST seulement.
    await db.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."AuditLog" ADD CONSTRAINT reject_role CHECK (action <> 'USER_ROLE_CHANGED') NOT VALID`,
    );

    assert.equal(
      (
        await request(
          "/users/" + target + "/role",
          "PATCH",
          { role: "ADMIN" },
          root,
        )
      ).status,
      500,
    );

    assert.equal(
      (await db.user.findUnique({ where: { id: target } })).role,
      "AGENT",
    );

    assert.equal(await db.auditLog.count(), 3);

    assert.equal(
      (await request("/auth/me", "GET", undefined, fresh.accessToken)).status,
      200,
    );

    await db.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."AuditLog" DROP CONSTRAINT reject_role`,
    );

    const secondRoot = await db.user.create({
      data: {
        email: "second-root@example.test",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        passwordHash,
      },
    });
    const secondSession = await (
      await request("/auth/login", "POST", {
        email: secondRoot.email,
        password,
      })
    ).json();
    const changes = await Promise.all([
      request(
        "/users/" + users.SUPER_ADMIN.id + "/role",
        "PATCH",
        { role: "ADMIN" },
        root,
      ),
      request(
        "/users/" + secondRoot.id + "/status",
        "PATCH",
        { status: "DISABLED" },
        secondSession.accessToken,
      ),
    ]);

    assert.deepEqual(
      changes.map((response) => response.status).sort(),
      [200, 409],
    );

    assert.equal(
      await db.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } }),
      1,
    );
  },
);
