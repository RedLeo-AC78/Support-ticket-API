import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";

import { createApp } from "../dist/app.js";

import { ticketListInput } from "../dist/validators/list.validation.js";

import { rateLimit } from "../dist/middlewares/rate-limit.js";
import { errorHandler } from "../dist/middlewares/error-handler.js";

import { openapi } from "../dist/docs/openapi.js";

test("pagination : valeurs bornées, doublons et injection dans le tri refusés", () => {
  assert.deepEqual(ticketListInput(), {
    page: 1,
    limit: 20,
    sortBy: "id",
    order: "desc",
    status: undefined,
    aiState: undefined,
    search: undefined,
  });

  for (const query of [
    { page: "0" },
    { limit: "101" },
    { page: "1.5" },
    { page: "100001" },
    { limit: ["1", "2"] },
    { status: "ROOT" },
    { sortBy: "id; DROP TABLE Ticket" },
    { order: ["asc"] },
    { search: " " },
    { ownerId: "1" },
  ])
    assert.throws(
      () => ticketListInput(query),
      (error) => error.status === 400,
    );

  assert.equal(
    ticketListInput({
      search: "l'école",
      status: "OPEN",
      sortBy: "title",
      order: "asc",
    }).search,
    "l'école",
  );
});

test("limiteur : clés indépendantes et expiration de la fenêtre", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });

  const middleware = rateLimit(2, 1000, (req) => req.ip);

  const call = (ip) => {
    let error;
    let retry;

    middleware(
      { ip },
      {
        set: (_key, value) => {
          retry = value;
        },
      },
      (e) => {
        error = e;
      },
    );

    return { error, retry };
  };

  assert.equal(call("a").error, undefined);

  assert.equal(call("a").error, undefined);

  assert.equal(call("a").error.status, 429);

  assert.equal(call("b").error, undefined);

  t.mock.timers.tick(1001);

  assert.equal(call("a").error, undefined);
});

test("erreur inattendue : aucune fuite de détails", (t) => {
  t.mock.method(console, "error", () => {});

  let status;
  let payload;

  errorHandler(
    new Error("secret-db-password"),
    {},
    {
      headersSent: false,
      status(value) {
        status = value;

        return this;
      },
      json(value) {
        payload = value;
      },
    },
    () => {},
  );

  assert.equal(status, 500);

  assert.deepEqual(Object.keys(payload).sort(), ["code", "error", "status"]);

  assert.equal(JSON.stringify(payload).includes("secret-db-password"), false);
});

test("HTTP : erreurs communes, JSON invalide, taille, force brute et limite globale", async (t) => {
  const server = createApp({}, randomBytes(32).toString("hex")).listen(
    0,
    "127.0.0.1",
  );

  await once(server, "listening");

  t.after(() => new Promise((resolve) => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}`;

  const post = (body) =>
    fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

  let r = await post("{");

  assert.equal(r.status, 400);

  assert.equal((await r.json()).code, "BAD_REQUEST");

  r = await post(JSON.stringify({ big: "x".repeat(66000) }));

  assert.equal(r.status, 413);

  for (let i = 0; i < 30; i++)
    assert.equal(
      (
        await post(
          JSON.stringify({ email: "test@example.test", password: "short" }),
        )
      ).status,
      400,
    );

  r = await post(
    JSON.stringify({ email: "test@example.test", password: "short" }),
  );

  assert.equal(r.status, 429);

  assert.ok(Number(r.headers.get("retry-after")) > 0);

  assert.equal((await r.json()).code, "TOO_MANY_REQUESTS");

  const spec = await (await fetch(base + "/openapi.json")).json();

  assert.equal(spec.openapi, "3.0.3");

  for (let i = 0; i < 300; i++) r = await fetch(base + "/missing");

  assert.equal(r.status, 429);
});

test("OpenAPI : toutes les routes métier, références et authentification décrites", () => {
  assert.equal(
    Object.values(openapi.paths).reduce(
      (n, path) => n + Object.keys(path).length,
      0,
    ),
    19,
  );

  function visit(value) {
    if (!value || typeof value !== "object") return;

    if (value.$ref) {
      const resolved = value.$ref
        .slice(2)
        .split("/")
        .reduce((node, key) => node?.[key], openapi);

      assert.ok(resolved, value.$ref);
    }

    for (const child of Object.values(value)) visit(child);
  }

  visit(openapi);

  assert.deepEqual(openapi.paths["/auth/login"].post.security, []);

  assert.equal(openapi.components.securitySchemes.bearerAuth.scheme, "bearer");
});
