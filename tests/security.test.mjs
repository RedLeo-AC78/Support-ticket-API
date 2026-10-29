import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, passwordValue, emailValue, newToken, digest, tokenValue } from '../dist/security.js';

test('scrypt : sel unique, vérification et espaces préservés', async () => {
  const password = '  une phrase secrete tres longue  ';
  assert.equal(passwordValue(password), password);
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('un autre mot de passe', first), false);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword(password, 'corrompu'), false);
});

test('validation des identifiants et tokens aléatoires', () => {
  assert.equal(emailValue('  Alice@Example.com '), 'alice@example.com');
  for (const email of ['', 'a', 'a@', {}, 'a b@example.com']) assert.throws(() => emailValue(email));
  for (const password of ['', 'trop court', 'a'.repeat(129), null]) assert.throws(() => passwordValue(password));
  const a = newToken(), b = newToken();
  assert.notEqual(a, b);
  assert.equal(tokenValue(a), a);
  assert.equal(digest(a).length, 64);
  assert.notEqual(digest(a), a);
  assert.throws(() => tokenValue('incorrect'));
});
