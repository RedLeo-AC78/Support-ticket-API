import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { HttpError } from './security.js';

export const ACCESS_SECONDS = 900;
const issuer = 'support-ticket-api';
const audience = 'support-ticket-client';
export function jwtService(secret: string | undefined) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error('JWT_SECRET doit contenir 64 caractères hexadécimaux aléatoires. Voir docs/LOT2.md.');
  const key = Buffer.from(secret, 'hex');
  return {
    async sign(userId: number, sessionId: string, expiresAt: Date) {
      return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(String(userId)).setIssuer(issuer).setAudience(audience).setJti(randomUUID())
        .setIssuedAt().setExpirationTime(Math.floor(expiresAt.getTime() / 1000)).sign(key);
    },
    async verify(token: string) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'], issuer, audience, typ: 'JWT', maxTokenAge: '15m',
          requiredClaims: ['exp', 'iat', 'sub', 'sid', 'jti'],
        });
        if (typeof payload.sub !== 'string' || !/^[1-9]\d*$/.test(payload.sub) ||
            typeof payload.sid !== 'string' || typeof payload.jti !== 'string') throw new Error();
        return { userId: Number(payload.sub), sessionId: payload.sid };
      } catch { throw new HttpError(401, 'Token invalide ou expiré.'); }
    },
  };
}
export type JwtService = ReturnType<typeof jwtService>;
