import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PostgresRepository } from '../src/lib/server/postgres.ts';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to your local PostgreSQL database.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  if (process.argv[2] === 'migrate') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(837461920)");
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY)');
      for (const version of ['001_party', '002_signup_receipts']) {
        const result = await client.query('SELECT version FROM schema_migrations WHERE version=$1', [version]);
        if (!result.rowCount) {
          await client.query(readFileSync(new URL(`../migrations/${version}.sql`, import.meta.url), 'utf8'));
          await client.query('INSERT INTO schema_migrations VALUES ($1)', [version]);
        }
      }
      await client.query('COMMIT');
      console.log('Migrations applied.');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } else if (process.argv[2] === 'seed') {
    await new PostgresRepository(pool, process.env.EVENT_ID || 'halloween-demo').seed();
    console.log('Demo seed ready; existing event left unchanged.');
  } else throw new Error('Use migrate or seed.');
} finally { await pool.end(); }
