import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../dist/app.js';
import { Prisma } from '../dist/generated/prisma/client.js';

test('API HTTP : cycle de vie et erreurs (dépôt simulé)', async (t) => {
  const rows = [];
  const db = { ticket: {
    async create({ data }) { const row = { id: rows.length + 1, ...data, status: 'OPEN' }; rows.push(row); return row; },
    async findMany() { return [...rows].reverse(); },
    async findUnique({ where }) { return rows.find(row => row.id === where.id) ?? null; },
    async update({ where, data }) {
      const row = rows.find(row => row.id === where.id);
      if (!row) throw new Prisma.PrismaClientKnownRequestError('Missing', { code: 'P2025', clientVersion: '7' });
      Object.assign(row, data); return row;
    },
  } };
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.deepEqual(await (await request('/tickets')).json(), []);
  const created = await request('/tickets', 'POST', { title: ' Connexion ', description: 'Impossible de me connecter' });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('location'), '/tickets/1');
  assert.equal((await created.json()).status, 'OPEN');
  assert.equal((await (await request('/tickets/1')).json()).title, 'Connexion');
  for (const status of ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN']) {
    const response = await request('/tickets/1/status', 'PATCH', { status });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, status);
  }
  assert.equal((await (await request('/tickets')).json()).length, 1);
  for (const body of [{}, { title: ' ', description: 'x' }, { title: 'a'.repeat(151), description: 'x' }, { title: 'a', description: 'b'.repeat(5001) }, [], null]) {
    assert.equal((await request('/tickets', 'POST', body)).status, 400);
  }
  for (const id of ['abc', '0', '-1', '1.2', '2147483648']) {
    assert.equal((await request(`/tickets/${id}`)).status, 400);
  }
  assert.equal((await request('/tickets/999')).status, 404);
  assert.equal((await request('/tickets/999/status', 'PATCH', { status: 'OPEN' })).status, 404);
  assert.equal((await request('/tickets/1/status', 'PATCH', { status: 'INVALID' })).status, 400);
  assert.equal((await request('/unknown')).status, 404);
  assert.equal((await fetch(base + '/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
});
