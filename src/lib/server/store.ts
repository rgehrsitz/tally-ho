import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { DATABASE_URL, DATABASE_CA_CERT, EVENT_ID } from '$app/env/private';
import { applyAction, guestVisible, RuleError, seedParty, type Party } from '../domain';
import { PostgresRepository } from './postgres';
import { settings } from './runtime';
import { databaseConfig } from './settings';

export const dataDir = resolve(process.cwd(), '.data');
const file = resolve(dataDir, 'demo.json');
// An explicit URL selects PostgreSQL; failures never silently fall back to files.
const pool = DATABASE_URL ? new Pool({ ...databaseConfig(DATABASE_URL, DATABASE_CA_CERT || undefined), max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 }) : null;
pool?.on('error', () => console.error('An idle database connection failed.'));
const postgres = pool ? new PostgresRepository(pool, EVENT_ID || 'halloween-demo') : null;
export async function hasHostAccess(userId: string): Promise<boolean> {
  const config = settings();
  if (config.mode !== 'supabase' || !pool || !/^[a-f0-9-]{36}$/i.test(userId)) return false;
  const result = await pool.query('SELECT 1 FROM event_hosts WHERE event_id=$1 AND user_id=$2', [config.eventId, userId]);
  return !!result.rowCount;
}
function readFileParty(): Party {
  mkdirSync(dataDir, { recursive: true });
  try { return JSON.parse(readFileSync(file, 'utf8')) as Party; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; const state = seedParty(); saveFileParty(state); return state; }
}
function saveFileParty(state: Party): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
export async function readParty(): Promise<Party> {
  settings();
  return postgres ? postgres.read() : readFileParty();
}
export async function actOnParty(input: Record<string, unknown>, voter: string, host: boolean): Promise<Party> {
  settings();
  if (postgres) return postgres.act(input, voter, host);
  // No awaits between reading and writing: single-process file demo only.
  const state = readFileParty();
  if (input.action === 'reset') {
    if (!host) throw new RuleError('Host sign-in required.');
    Object.assign(state, seedParty());
  } else applyAction(state, input, voter, host);
  saveFileParty(state);
  return state;
}
/** 'public' for approved visible photos, 'pending' for host-only ones, null if unknown.
 * Reads entries only: the gallery requests one photo per entry per phone. */
export async function photoAccess(photo: string): Promise<'public' | 'pending' | null> {
  settings();
  const entries = postgres ? await postgres.entries() : readFileParty().entries;
  const owners = entries.filter(e => e.photo === photo);
  if (!owners.length) return null;
  return owners.some(e => guestVisible(entries, e)) ? 'public' : 'pending';
}
