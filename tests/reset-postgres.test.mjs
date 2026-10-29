import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createApp } from '../dist/app.js';
import { hashPassword, digest, newToken } from '../dist/security.js';

test('PostgreSQL : désactivation, réactivation, reset, concurrence et dernier Super Admin', { skip: !process.env.RUN_DB_TESTS }, async t => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString);
  const schema = `test_reset_${randomBytes(8).toString('hex')}`;
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  let server, app;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (app) await app.locals.waitForBackgroundTasks();
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
  const password = 'Phrase initiale de test suffisamment longue';
  const newPassword = 'Nouvelle phrase de test suffisamment longue';
  const passwordHash = await hashPassword(password), users = {};
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'AGENT', 'USER']) users[role] = await db.user.create({ data: { email: `${role.toLowerCase()}@example.test`, role, status: 'ACTIVE', passwordHash } });
  const invited = await db.user.create({ data: { email: 'invited@example.test' } });
  const mailbox = []; let mailFailure = false;
  app = createApp(db, randomBytes(32).toString('hex'), async mail => {
    if (mailFailure) throw new Error('Panne simulée');
    mailbox.push(mail); return { status: 'accepted' };
  });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body, token) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  async function login(user, pw = password) {
    const r = await request('/auth/login', 'POST', { email: user.email, password: pw });
    assert.equal(r.status, 200); return r.json();
  }
  async function forgot(email) {
    const response = await request('/auth/forgot-password', 'POST', { email });
    assert.equal(response.status, 202);
    const result = await response.json();
    await app.locals.waitForBackgroundTasks();
    return result;
  }
  const codeFor = email => mailbox.filter(m => m.to === email && m.subject.startsWith('Réinitialisation')).at(-1).text.match(/\n([A-Za-z0-9_-]{43})\n/)[1];
  const reset = token => request('/auth/reset-password', 'POST', { token, newPassword, confirmPassword: newPassword });
  const sessions = {};
  for (const role of Object.keys(users)) sessions[role] = await login(users[role]);
  const root = sessions.SUPER_ADMIN.accessToken;
  const status = (id, value, access = root) => request(`/users/${id}/status`, 'PATCH', { status: value }, access);
  for (const role of ['ADMIN', 'AGENT', 'USER']) assert.equal((await status(users.USER.id, 'DISABLED', sessions[role].accessToken)).status, 403);
  assert.equal((await status(users.SUPER_ADMIN.id, 'DISABLED')).status, 409);
  assert.equal((await status('abc', 'DISABLED')).status, 400);
  assert.equal((await status(2147483647, 'DISABLED')).status, 404);

  const generic = await forgot('missing@example.test');
  assert.deepEqual(await forgot(invited.email), generic);
  assert.equal(mailbox.length, 0);
  assert.deepEqual(await forgot(users.USER.email), generic);
  const oldReset = codeFor(users.USER.email);
  assert.ok(await db.passwordReset.findUnique({ where: { hash: digest(oldReset) } }));
  assert.equal((await status(users.USER.id, 'DISABLED')).status, 200);
  assert.equal((await request('/auth/me', 'GET', undefined, sessions.USER.accessToken)).status, 401);
  assert.equal((await request('/auth/refresh', 'POST', { refreshToken: sessions.USER.refreshToken })).status, 401);
  assert.equal((await request('/auth/login', 'POST', { email: users.USER.email, password })).status, 401);
  const count = mailbox.length;
  assert.deepEqual(await forgot(users.USER.email), generic); assert.equal(mailbox.length, count);
  assert.equal((await reset(oldReset)).status, 400);
  assert.equal((await status(users.USER.id, 'ACTIVE')).status, 200);
  assert.equal((await request('/auth/me', 'GET', undefined, sessions.USER.accessToken)).status, 401);
  assert.equal((await request('/auth/refresh', 'POST', { refreshToken: sessions.USER.refreshToken })).status, 401);
  const freshUser = await login(users.USER);

  const invitationCode = newToken();
  await db.invitation.create({ data: { hash: digest(invitationCode), userId: invited.id, expiresAt: new Date(Date.now() + 3600000) } });
  assert.equal((await status(invited.id, 'DISABLED')).status, 200);
  const reactivated = await status(invited.id, 'ACTIVE');
  assert.equal((await reactivated.json()).user.status, 'INVITED');
  assert.equal(await db.invitation.count({ where: { userId: invited.id } }), 0);
  assert.equal((await reset(invitationCode)).status, 400);

  // Troisième demande pour USER : un seul code actuel, reset concurrent.
  await forgot(users.USER.email);
  const code = codeFor(users.USER.email);
  assert.equal((await reset(oldReset)).status, 400);
  assert.equal((await request('/auth/reset-password', 'POST', { token: code, newPassword, confirmPassword: 'different' })).status, 400);
  const responses = await Promise.all([reset(code), reset(code)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
  await app.locals.waitForBackgroundTasks();
  assert.equal((await reset(code)).status, 400);
  assert.equal((await request('/auth/me', 'GET', undefined, freshUser.accessToken)).status, 401);
  assert.equal((await request('/auth/refresh', 'POST', { refreshToken: freshUser.refreshToken })).status, 401);
  assert.equal((await request('/auth/login', 'POST', { email: users.USER.email, password })).status, 401);
  await login(users.USER, newPassword);
  const notification = mailbox.find(m => m.subject.includes('a été modifié'));
  assert.ok(notification); assert.ok(!notification.text.includes(newPassword));

  await forgot(users.AGENT.email); const expired = codeFor(users.AGENT.email);
  await db.passwordReset.updateMany({ where: { userId: users.AGENT.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await reset(expired)).status, 400);
  await forgot(users.AGENT.email); const first = codeFor(users.AGENT.email);
  await forgot(users.AGENT.email); const second = codeFor(users.AGENT.email);
  assert.notEqual(first, second); assert.equal((await reset(first)).status, 400);
  assert.equal((await reset(second)).status, 200);
  await app.locals.waitForBackgroundTasks();

  mailFailure = true;
  assert.deepEqual(await forgot(users.ADMIN.email), generic);
  assert.equal(await db.passwordReset.count({ where: { userId: users.ADMIN.id } }), 0);
  mailFailure = false;
  await forgot(users.ADMIN.email); const retry = codeFor(users.ADMIN.email);
  mailFailure = true; // Notification en panne : le reset lui-même réussit.
  assert.equal((await reset(retry)).status, 200);
  await app.locals.waitForBackgroundTasks(); mailFailure = false;
  await login(users.ADMIN, newPassword);

  for (let i = 0; i < 3; i++) await forgot('limit@example.test');
  assert.equal((await request('/auth/forgot-password', 'POST', { email: 'limit@example.test' })).status, 429);
  const secondRoot = await db.user.create({ data: { email: 'root2@example.test', role: 'SUPER_ADMIN', status: 'ACTIVE', passwordHash } });
  const root2 = await login(secondRoot);
  const changes = await Promise.all([status(users.SUPER_ADMIN.id, 'DISABLED', root), status(secondRoot.id, 'DISABLED', root2.accessToken)]);
  assert.deepEqual(changes.map(r => r.status).sort(), [200, 409]);
  assert.equal(await db.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } }), 1);
});
