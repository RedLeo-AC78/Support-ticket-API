import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createApp } from '../dist/app.js';
import { hashPassword } from '../dist/security.js';

test('PostgreSQL : auth, rôles, propriété et rotation concurrente', { skip: !process.env.RUN_DB_TESTS }, async t => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString);
  const schema = `test_auth_${randomBytes(8).toString('hex')}`;
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  });
  for (const name of (await readdir('prisma/migrations')).filter(n => /^\d/.test(n)).sort()) {
    const sql = await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8');
    await admin.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      for (const statement of sql.split(';').filter(s => s.trim())) await tx.$executeRawUnsafe(statement);
    });
  }
  const password = 'Une phrase de test assez longue!';
  const passwordHash = await hashPassword(password), users = {};
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'AGENT', 'USER']) users[role] = await db.user.create({ data: { email: `${role}@example.test`.toLowerCase(), role, status: 'ACTIVE', passwordHash } });
  const other = await db.user.create({ data: { email: 'other@example.test', status: 'ACTIVE', passwordHash } });
  const legacy = await db.ticket.create({ data: { title: 'Historique', description: 'Sans propriétaire' } });
  const privateTicket = await db.ticket.create({ data: { title: 'Privé', description: 'Autre utilisateur', ownerId: other.id } });
  server = createApp(db, randomBytes(32).toString('hex')).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body, token) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  async function login(user) {
    const r = await request('/auth/login', 'POST', { email: user.email, password });
    assert.equal(r.status, 200); return r.json();
  }
  const sessions = {};
  for (const role of Object.keys(users)) sessions[role] = await login(users[role]);
  const userToken = sessions.USER.accessToken;
  const me = await (await request('/auth/me', 'GET', undefined, userToken)).json();
  assert.equal(me.id, users.USER.id); assert.equal(me.passwordHash, undefined);
  const created = await request('/tickets', 'POST', { title: ' Test ', description: 'Description', ownerId: other.id }, userToken);
  assert.equal(created.status, 201);
  const ticket = await created.json(); assert.equal(ticket.ownerId, users.USER.id);
  assert.equal((await request(`/tickets/${privateTicket.id}`, 'GET', undefined, userToken)).status, 404);
  assert.deepEqual((await (await request('/tickets', 'GET', undefined, userToken)).json()).map(x => x.id), [ticket.id]);
  assert.equal((await request(`/tickets/${ticket.id}/status`, 'PATCH', { status: 'CLOSED' }, userToken)).status, 403);
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'AGENT']) {
    const access = sessions[role].accessToken;
    assert.equal((await request(`/tickets/${ticket.id}/status`, 'PATCH', { status: 'IN_PROGRESS' }, access)).status, 200);
    assert.equal((await request('/users', 'GET', undefined, access)).status, role === 'AGENT' ? 403 : 200);
    assert.equal((await request(`/tickets/${legacy.id}`, 'GET', undefined, access)).status, role === 'AGENT' ? 404 : 200);
  }
  assert.equal((await request('/tickets/0', 'GET', undefined, userToken)).status, 400);
  assert.equal((await request('/tickets', 'POST', { title: '', description: 'x' }, userToken)).status, 400);
  const refreshed = await request('/auth/refresh', 'POST', { refreshToken: sessions.USER.refreshToken });
  assert.equal(refreshed.status, 200); const pair = await refreshed.json();
  assert.notEqual(pair.refreshToken, sessions.USER.refreshToken);
  assert.equal((await request('/auth/me', 'GET', undefined, userToken)).status, 401);
  assert.equal((await request('/auth/me', 'GET', undefined, pair.accessToken)).status, 200);
  assert.equal((await request('/auth/refresh', 'POST', { refreshToken: sessions.USER.refreshToken })).status, 401);
  assert.equal((await request('/auth/me', 'GET', undefined, pair.accessToken)).status, 401);
  const concurrent = await login(users.USER);
  const responses = await Promise.all([1, 2].map(() => request('/auth/refresh', 'POST', { refreshToken: concurrent.refreshToken })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
  const winner = await responses.find(r => r.status === 200).json();
  assert.equal((await request('/auth/me', 'GET', undefined, winner.accessToken)).status, 401);
  const loggedOut = await login(users.USER);
  assert.equal((await request('/auth/logout', 'POST', { refreshToken: loggedOut.refreshToken })).status, 204);
  assert.equal((await request('/auth/me', 'GET', undefined, loggedOut.accessToken)).status, 401);
  assert.equal((await request('/auth/refresh', 'POST', { refreshToken: loggedOut.refreshToken })).status, 401);
  const disabled = await login(users.USER);
  await db.user.update({ where: { id: users.USER.id }, data: { status: 'DISABLED' } });
  assert.equal((await request('/auth/me', 'GET', undefined, disabled.accessToken)).status, 401);
  assert.equal((await request('/auth/refresh', 'POST', { refreshToken: disabled.refreshToken })).status, 401);
  assert.equal((await request('/auth/login', 'POST', { email: users.USER.email, password })).status, 401);
  await db.user.update({ where: { id: users.USER.id }, data: { status: 'INVITED', passwordHash: null } });
  assert.equal((await request('/auth/login', 'POST', { email: users.USER.email, password })).status, 401);
  assert.equal((await request('/auth/login', 'POST', { email: 'missing@example.test', password })).status, 401);
  await db.session.updateMany({ where: { userId: users.ADMIN.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await request('/auth/refresh', 'POST', { refreshToken: sessions.ADMIN.refreshToken })).status, 401);
});
