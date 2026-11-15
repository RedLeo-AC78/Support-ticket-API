import { test } from "node:test";
import assert from "node:assert/strict";

import { ticketsService } from "../dist/services/tickets.service.js";

test("service tickets sans Express : propriétaire imposé et validation", async () => {
  let stored;
  const service = ticketsService({
    create: async (data) => {
      stored = data;

      return { id: 1, ...data };
    },
  });

  await service.create(
    { title: " Test ", description: " Texte ", ownerId: 999, status: "CLOSED" },
    { id: 7, role: "USER" },
  );

  assert.deepEqual(stored, { title: "Test", description: "Texte", ownerId: 7 });

  assert.throws(
    () =>
      service.create({ title: " ", description: "x" }, { id: 7, role: "USER" }),
    /title/,
  );
});

test("service tickets sans Express : visibilité et ticket absent", async () => {
  const calls = [];
  const service = ticketsService({
    list: async (scope) => {
      calls.push(scope);

      return [];
    },
    find: async (id, scope) => {
      calls.push({ id, scope });

      return null;
    },
  });

  await service.list({ id: 7, role: "USER" });

  await service.list({ id: 8, role: "AGENT" });

  await service.list({ id: 9, role: "ADMIN" });

  assert.deepEqual(calls, [{ ownerId: 7 }, { ownerId: { not: null } }, {}]);

  await assert.rejects(
    service.get("12", { id: 7, role: "USER" }),
    (error) => error.status === 404,
  );

  assert.deepEqual(calls.at(-1), { id: 12, scope: { ownerId: 7 } });
});
