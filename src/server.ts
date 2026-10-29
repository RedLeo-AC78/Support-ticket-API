import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { createApp } from './app.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL doit être défini dans .env.');
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT invalide.');

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }) });
await db.$connect();
const app = createApp(db);
const server = app.listen(port, () => console.log(`API disponible : http://localhost:${port}/tickets`));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(() => { void (async () => {
    await app.locals.waitForBackgroundTasks();
    await db.$disconnect();
    clearTimeout(timeout);
  })().catch(() => { process.exitCode = 1; }); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.on('error', async (error) => { console.error(error); await db.$disconnect(); process.exitCode = 1; });
