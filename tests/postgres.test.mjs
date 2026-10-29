import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createApp } from '../dist/app.js';
import { hashPassword, digest } from '../dist/security.js';

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
  const mailbox = [];
  let mailFailure = false;
  server = createApp(db, randomBytes(32).toString('hex'), async mail => {
    if (mailFailure) throw new Error('Panne email simulée');
    mailbox.push(mail); return { status: 'accepted' };
  }).listen(0, '127.0.0.1');
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

  // Invitations : transport capturé en mémoire, aucun vrai email envoyé.
  const superToken = sessions.SUPER_ADMIN.accessToken;
  for (const role of ['USER', 'AGENT', 'ADMIN']) {
    // Comptes USER/ADMIN modifiés ci-dessus : remettre un état actif uniquement pour ce test isolé.
    await db.user.update({ where: { id: users[role].id }, data: { status: 'ACTIVE', passwordHash } });
    const pair = await login(users[role]);
    assert.equal((await request('/users', 'POST', { email: `${role}-forbidden@example.test` }, pair.accessToken)).status, 403);
  }
  assert.equal((await request('/users', 'POST', { email: 'anonymous@example.test' })).status, 401);
  assert.equal((await request('/users', 'POST', { email: 'bad@example.test', role: 'ROOT' }, superToken)).status, 400);
  assert.equal((await request('/users', 'POST', { email: 'bad@example.test', password }, superToken)).status, 400);
  async function invite(email, role = 'USER') {
    const response = await request('/users', 'POST', { email, role }, superToken);
    assert.equal(response.status, 201);
    return response.json();
  }
  function latestCode() {
    return mailbox.at(-1).text.match(/\n([A-Za-z0-9_-]{43})\n/)[1];
  }
  const invited = await invite('New@example.test', 'AGENT');
  assert.equal(invited.user.email, 'new@example.test');
  assert.equal(invited.user.status, 'INVITED');
  assert.equal(invited.user.passwordHash, undefined);
  assert.equal(invited.invitation.status, 'accepted');
  const code = latestCode();
  assert.ok(!JSON.stringify(invited).includes(code));
  const storedUser = await db.user.findUnique({ where: { id: invited.user.id } });
  assert.equal(storedUser.passwordHash, null);
  assert.ok(await db.invitation.findUnique({ where: { hash: digest(code) } }));
  assert.equal((await request('/users', 'POST', { email: 'NEW@example.test' }, superToken)).status, 409);
  assert.equal((await request('/auth/login', 'POST', { email: invited.user.email, password })).status, 401);
  const acceptBody = { token: code, password, confirmPassword: password };
  assert.equal((await request('/auth/accept-invitation', 'POST', { ...acceptBody, role: 'SUPER_ADMIN' })).status, 400);
  assert.equal((await request('/auth/accept-invitation', 'POST', { ...acceptBody, confirmPassword: 'different' })).status, 400);
  // Deux acceptations concurrentes : une seule activation.
  const acceptResponses = await Promise.all([1, 2].map(() => request('/auth/accept-invitation', 'POST', acceptBody)));
  assert.deepEqual(acceptResponses.map(r => r.status).sort(), [200, 400]);
  const accepted = await acceptResponses.find(r => r.status === 200).json();
  assert.equal(accepted.user.role, 'AGENT');
  assert.equal(accepted.user.status, 'ACTIVE');
  assert.equal((await request('/auth/accept-invitation', 'POST', acceptBody)).status, 400);
  await login(invited.user);
  assert.equal((await request(`/users/${invited.user.id}/invitation`, 'POST', {}, superToken)).status, 409);
  const expired = await invite('expired@example.test');
  const expiredCode = latestCode();
  await db.invitation.updateMany({ where: { userId: expired.user.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await request('/auth/accept-invitation', 'POST', { ...acceptBody, token: expiredCode })).status, 400);
  assert.equal((await request(`/users/${expired.user.id}/invitation`, 'POST', {}, superToken)).status, 200);
  const replacement = latestCode();
  assert.notEqual(replacement, expiredCode);
  assert.equal(await db.invitation.findUnique({ where: { hash: digest(expiredCode) } }), null);
  assert.equal((await request('/auth/accept-invitation', 'POST', { ...acceptBody, token: expiredCode })).status, 400);
  await db.user.update({ where: { id: expired.user.id }, data: { status: 'DISABLED' } });
  assert.equal((await request('/auth/accept-invitation', 'POST', { ...acceptBody, token: replacement })).status, 400);
  assert.equal((await request(`/users/${expired.user.id}/invitation`, 'POST', {}, superToken)).status, 409);
  mailFailure = true;
  const failed = await invite('failed@example.test');
  assert.equal(failed.invitation.status, 'failed');
  assert.equal(failed.user.status, 'INVITED');
  mailFailure = false;
  const retry = await request(`/users/${failed.user.id}/invitation`, 'POST', {}, superToken);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).invitation.status, 'accepted');
  assert.equal((await request('/auth/accept-invitation', 'POST', { ...acceptBody, token: latestCode() })).status, 200);
  assert.equal((await request('/users/2147483647/invitation', 'POST', {}, superToken)).status, 404);
});
