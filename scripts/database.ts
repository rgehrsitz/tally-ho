import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PostgresRepository } from '../src/lib/server/postgres.ts';
import { databaseConfig } from '../src/lib/server/settings.ts';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to your local PostgreSQL database.');
const pool = new Pool({ ...databaseConfig(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT || undefined), max: 1 });
try {
  if (process.argv[2] === 'migrate') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(837461920)");
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY)');
      for (const version of ['001_party', '002_signup_receipts', '003_event_hosts']) {
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
    // --empty starts a real event with no sample costumes; --name sets its title.
    const args = process.argv.slice(3);
    const nameAt = args.indexOf('--name');
    if (nameAt >= 0 && !args[nameAt + 1]) throw new Error('Supply an event name after --name.');
    const created = await new PostgresRepository(pool, process.env.EVENT_ID || 'halloween-demo').seed({ empty: args.includes('--empty'), ...(nameAt >= 0 ? { name: args[nameAt + 1] } : {}) });
    console.log(created ? `Event ${process.env.EVENT_ID || 'halloween-demo'} created${args.includes('--empty') ? ' with no entries' : ' with demo entries'}.` : 'Event already exists; left unchanged.');
  } else if (process.argv[2] === 'grant-host' || process.argv[2] === 'revoke-host') {
    const id = process.argv[3];
    if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new Error('Supply the verified Supabase Auth user UUID.');
    const event = process.env.EVENT_ID || 'halloween-demo';
    if (process.argv[2] === 'grant-host') await pool.query('INSERT INTO event_hosts (event_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [event,id]);
    else await pool.query('DELETE FROM event_hosts WHERE event_id=$1 AND user_id=$2', [event,id]);
    console.log('Event host permission updated.');
  } else throw new Error('Use migrate, seed, grant-host or revoke-host.');
} finally { await pool.end(); }
