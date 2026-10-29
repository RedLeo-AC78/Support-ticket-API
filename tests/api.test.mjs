import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createApp } from '../dist/app.js';
test('HTTP : accès anonyme et faux JWT refusés avant tout accès DB', async t => {
  const server = createApp({}, randomBytes(32).toString('hex')).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/tickets', '/tickets/1', '/users', '/auth/me']) {
    assert.equal((await fetch(base + route)).status, 401);
    assert.equal((await fetch(base + route, { headers: { Authorization: 'Bearer faux.jwt.token' } })).status, 401);
  }
  assert.equal((await fetch(base + '/auth/register', { method: 'POST' })).status, 404);
});
