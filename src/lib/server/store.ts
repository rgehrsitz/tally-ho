import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedParty, type Party } from '../domain';
// A synchronous read/mutate/atomic-write transaction is intentional for the single-process local demo.
// Replace this repository with PostgreSQL transactions before any hosted/multi-instance deployment.
export const dataDir = resolve(process.cwd(), '.data');
const file = resolve(dataDir, 'demo.json');
export function readParty(): Party {
  mkdirSync(dataDir, { recursive: true });
  try { return JSON.parse(readFileSync(file, 'utf8')) as Party; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; const state = seedParty(); saveParty(state); return state; }
}
export function saveParty(state: Party): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
