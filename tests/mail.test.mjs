import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer } from '../dist/mail.js';

test('Brevo : requête API correcte, sans envoi réel', async () => {
  const send = createMailer({ MAIL_MODE: 'brevo', BREVO_API_KEY: 'test-secret', MAIL_FROM_EMAIL: 'sender@example.test' }, async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.headers['api-key'], 'test-secret');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, [{ email: 'recipient@example.test' }]);
    assert.equal(body.textContent, 'Invitation de test');
    assert.equal(body.sender.email, 'sender@example.test');
    assert.ok(options.signal);
    return new Response('{}', { status: 201 });
  });
  assert.deepEqual(await send({ to: 'recipient@example.test', subject: 'Invitation', text: 'Invitation de test' }), { status: 'accepted' });
});
test('Brevo : erreurs neutralisées, configuration vérifiée', async () => {
  const env = { MAIL_MODE: 'brevo', BREVO_API_KEY: 'test-secret', MAIL_FROM_EMAIL: 'sender@example.test' };
  for (const status of [400, 401, 429, 500]) {
    const send = createMailer(env, async () => new Response('secret à ne pas exposer', { status }));
    await assert.rejects(send({ to: 'a@example.test', subject: 'test', text: 'test' }), error => !error.message.includes('secret'));
  }
  const send = createMailer(env, async () => { throw new Error('Détail réseau confidentiel'); });
  await assert.rejects(send({ to: 'a@example.test', subject: 'test', text: 'test' }), /fournisseur email/);
  assert.throws(() => createMailer({ MAIL_MODE: 'local', NODE_ENV: 'production' }));
  assert.throws(() => createMailer({ MAIL_MODE: 'brevo' }));
  assert.throws(() => createMailer({ MAIL_MODE: 'unknown' }));
});
