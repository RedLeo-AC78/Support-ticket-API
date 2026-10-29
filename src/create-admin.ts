import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { emailValue, passwordValue, hashPassword } from './security.js';

// Amorçage local uniquement : pas de route publique permettant de devenir super admin.
if (!process.stdin.isTTY) throw new Error('Exécutez cette commande dans un terminal interactif.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manque dans .env.');
let hidden = false;
const output = new Writable({ write(chunk, _encoding, callback) {
  if (!hidden) process.stdout.write(chunk);
  callback();
} });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function secret(label: string) {
  process.stdout.write(label);
  hidden = true;
  try { return await prompt.question(''); }
  finally { hidden = false; process.stdout.write('\n'); }
}
try {
  const email = emailValue(await prompt.question('Email du premier super administrateur : '));
  const password = passwordValue(await secret('Mot de passe (15 à 128 caractères, saisie masquée) : '));
  if (password !== await secret('Confirmez le mot de passe : ')) throw new Error('Les mots de passe ne correspondent pas.');
  const passwordHash = await hashPassword(password);
  await db.$transaction(async tx => {
    // Deux lancements simultanés ne doivent pas créer deux comptes d'amorçage.
    // Le verrou renvoie void : ne sélectionner que la constante entière pour Prisma.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(78234901)`;
    if (await tx.user.findFirst({ where: { role: 'SUPER_ADMIN' } })) throw new Error('Un super administrateur existe déjà. Aucun compte modifié.');
    if (await tx.user.findUnique({ where: { email } })) throw new Error('Cet email est déjà utilisé. Aucun compte modifié.');
    await tx.user.create({ data: { email, passwordHash, role: 'SUPER_ADMIN', status: 'ACTIVE' } });
  });
  console.log('Super administrateur créé. Le mot de passe n’est pas affiché ni enregistré en clair.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Création impossible.');
  process.exitCode = 1;
} finally {
  prompt.close();
  await db.$disconnect();
}
