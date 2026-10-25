import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const databaseDir = resolve('.data/postgres-local');
mkdirSync(databaseDir, { recursive: true });
const postgres = new EmbeddedPostgres({ databaseDir, port: 54329, user: 'tally', password: 'local-demo-only', persistent: true,
  postgresFlags: ['-h', '127.0.0.1', '-k', '/tmp'], onLog: () => {}, onError: message => console.error(message) });
if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await postgres.initialise();
await postgres.start();
const client = postgres.getPgClient();
await client.connect();
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname='tally_ho'");
if (!rowCount) await client.query('CREATE DATABASE tally_ho');
await client.end();
console.log('Local PostgreSQL ready on 127.0.0.1:54329. Keep this terminal open; Ctrl+C stops it.');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await postgres.stop(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
