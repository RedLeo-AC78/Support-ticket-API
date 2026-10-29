import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { jwtService } from '../dist/jwt.js';
test('JWT : signature, expiration, issuer, audience, algorithme et claims', async () => {
  const secret = randomBytes(32).toString('hex'), jwt = jwtService(secret);
  const valid = await jwt.sign(1, 'session-id', new Date(Date.now() + 900000));
  assert.deepEqual(await jwt.verify(valid), { userId: 1, sessionId: 'session-id' });
  await assert.rejects(jwtService(randomBytes(32).toString('hex')).verify(valid));
  await assert.rejects(jwt.verify(await jwt.sign(1, 'session-id', new Date(Date.now() - 1000))));
  for (const change of [{ iss: 'wrong' }, { aud: 'wrong' }, { sid: undefined }, { exp: undefined }, { sub: 'abc' }]) {
    const token = await new SignJWT({ sub: '1', sid: 's', jti: 'j', iss: 'support-ticket-api', aud: 'support-ticket-client', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+900, ...change })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(Buffer.from(secret, 'hex'));
    await assert.rejects(jwt.verify(token));
  }
  const wrongAlg = await new SignJWT({}).setProtectedHeader({ alg: 'HS384' }).sign(randomBytes(48));
  await assert.rejects(jwt.verify(wrongAlg));
  assert.throws(() => jwtService('weak'));
});
