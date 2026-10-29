import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const content = await readFile('.env', 'utf8');
if (/^\s*JWT_SECRET\s*=/m.test(content)) {
  console.log('JWT_SECRET existe déjà : aucune modification.');
} else {
  await appendFile('.env', `\nJWT_SECRET=${randomBytes(32).toString('hex')}\n`);
  console.log('Clé JWT créée dans .env sans affichage. Ne partagez pas ce fichier.');
}
