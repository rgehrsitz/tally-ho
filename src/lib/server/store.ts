import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { DATABASE_URL, EVENT_ID } from '$app/env/private';
import { applyAction, seedParty, type Party } from '../domain';
import { PostgresRepository } from './postgres';

export const dataDir = resolve(process.cwd(), '.data');
const file = resolve(dataDir, 'demo.json');
// An explicit URL selects PostgreSQL; failures never silently fall back to files.
const postgres = DATABASE_URL ? new PostgresRepository(new Pool({ connectionString: DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 }), EVENT_ID || 'halloween-demo') : null;
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
  return postgres ? postgres.read() : readFileParty();
}
export async function actOnParty(input: Record<string, unknown>, voter: string, host: boolean): Promise<Party> {
  if (postgres) return postgres.act(input, voter, host);
  // No awaits between reading and writing: single-process file demo only.
  const state = readFileParty();
  if (input.action === 'reset') {
    if (!host) throw new Error('Host sign-in required.');
    Object.assign(state, seedParty());
  } else applyAction(state, input, voter, host);
  saveFileParty(state);
  return state;
}
