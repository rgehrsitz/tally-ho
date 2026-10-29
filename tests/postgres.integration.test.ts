import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { PostgresRepository } from '../src/lib/server/postgres';
import { publicView, tally } from '../src/lib/domain';
import { fakeSupabase, hostUserId, otherEventUserId } from './support/fake-supabase';

let postgres: EmbeddedPostgres;
let pool: Pool;
let secondPool: Pool;
let repository: PostgresRepository;
let other: PostgresRepository;
let directory: string;
let app: ChildProcess;
let cloudApp: ChildProcess;
let cloudOrigin: string;
let cloudRuntime: string;
let cloudEnvironment: NodeJS.ProcessEnv;
let service: Awaited<ReturnType<typeof fakeSupabase>>;
let origin: string;
let runtimeDirectory: string;
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
function browser(base?: string) {
  const cookies = new Map<string, string>();
  return async (input?: Record<string, unknown>, host = false, path = '/api/demo', requestOrigin = base ?? origin) => {
    const response = await fetch(`${base ?? origin}${path}${host ? '?host=1' : ''}`, {
      method: input ? 'POST' : 'GET', headers: { 'content-type': 'application/json', origin: requestOrigin,
        cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') },
      ...(input ? { body: JSON.stringify(input) } : {})
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(';')[0].split('='); cookies.set(name, value);
    }
    return response;
  };
}
const vote = (entry: string | null, category = 'best') => ({ action: 'vote', category, entry });
const open = () => repository.act({ action: 'phase', phase: 'voting' }, '', true);
const close = () => repository.act({ action: 'phase', phase: 'closed' }, '', true);

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'tally-ho-pg-'));
  const port = await freePort();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'tally', password: 'integration-only', persistent: false,
    postgresFlags: ['-h', '127.0.0.1', '-k', '/tmp'], onLog: () => {}, onError: () => {} });
  await postgres.initialise();
  await postgres.start();
  const options = { host: '127.0.0.1', port, user: 'tally', password: 'integration-only', database: 'postgres', max: 4 };
  pool = new Pool(options);
  secondPool = new Pool(options);
  await pool.query(readFileSync(new URL('../migrations/001_party.sql', import.meta.url), 'utf8'));
  await pool.query(readFileSync(new URL('../migrations/002_signup_receipts.sql', import.meta.url), 'utf8'));
  await pool.query(readFileSync(new URL('../migrations/003_event_hosts.sql', import.meta.url), 'utf8'));
  repository = new PostgresRepository(pool);
  other = new PostgresRepository(secondPool);
  await repository.seed();
  const appPort = await freePort();
  origin = `http://127.0.0.1:${appPort}`;
  runtimeDirectory = join(process.cwd(), '.data', `integration-runtime-${appPort}`);
  app = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
    env: { ...process.env, DATABASE_URL: `postgresql://tally:integration-only@127.0.0.1:${port}/postgres`, EVENT_ID: 'halloween-demo', DEMO_HOST_PIN: '2468', APP_MODE: 'demo', TALLY_RUNTIME_DIR: runtimeDirectory }, stdio: 'ignore'
  });
  const deadline = Date.now() + 20000;
  for (;;) {
    try { const response = await fetch(`${origin}/api/demo`); if (response.ok) break; } catch { /* startup */ }
    if (Date.now() > deadline || app.exitCode !== null) throw new Error('Integration app failed to start.');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  service = await fakeSupabase();
  const cloudPort = await freePort();
  cloudOrigin = `http://127.0.0.1:${cloudPort}`;
  cloudRuntime = join(process.cwd(), '.data', `supabase-integration-${cloudPort}`);
  cloudEnvironment = { ...process.env, DATABASE_URL: `postgresql://tally:integration-only@127.0.0.1:${port}/postgres`, EVENT_ID: 'halloween-demo', APP_MODE: 'supabase',
    SUPABASE_URL: service.url, SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable', SUPABASE_SECRET_KEY: 'fixture-secret', SUPABASE_PHOTO_BUCKET: 'costume-photos', TALLY_RUNTIME_DIR: cloudRuntime };
  cloudApp = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', String(cloudPort), '--strictPort'], { env: cloudEnvironment, stdio: 'ignore' });
  const cloudDeadline = Date.now()+20000;
  for (;;) {
    try { const response = await fetch(`${cloudOrigin}/api/demo`); if(response.ok)break; } catch { /* startup */ }
    if(Date.now()>cloudDeadline || cloudApp.exitCode!==null)throw new Error('Supabase-mode test app failed to start.');
    await new Promise(resolve=>setTimeout(resolve,150));
  }

}, 60000);

afterAll(async () => {
  if (cloudApp && cloudApp.exitCode === null) {
    const exited = new Promise<void>(resolve => cloudApp.once('exit', () => resolve()));
    cloudApp.kill('SIGTERM'); await exited;
  }
  await service?.close();
  if(cloudRuntime)rmSync(cloudRuntime,{recursive:true,force:true});
  if (app && app.exitCode === null) {
    const exited = new Promise<void>(resolve => app.once('exit', () => resolve()));
    app.kill('SIGTERM'); await exited;
  }
  if (runtimeDirectory) rmSync(runtimeDirectory, { recursive: true, force: true });
  await pool?.end();
  await secondPool?.end();
  await postgres?.stop();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await repository.act({ action: 'reset' }, '', true);
  await pool.query('DELETE FROM event_hosts');
  if(service){service.state.publicBucket=false;service.state.failStorage=false;service.objects.clear();}
});

describe('real PostgreSQL transactions across independent pools', () => {
  it('persists independent individual and linked-couple winners and freezes closed results', async () => {
    await open();
    await repository.act(vote('gomez'), 'a', false);
    await other.act(vote('addams', 'couple'), 'a', false);
    await close();
    const closed = await other.read();
    expect(tally(closed).map(r => r.winners)).toEqual([['gomez'], [], ['addams']]);
    for (const input of [vote('morticia'), { action: 'merge', source: 'gomez', target: 'morticia' }, { action: 'edit', id: 'gomez', title: 'Changed', names: 'X' }, { action: 'moderate', id: 'gomez', operation: 'hide' }, { action: 'category', name: 'New', type: 'individual' }]) {
      await expect(other.act(input, 'a', true)).rejects.toThrow();
    }
    expect(await repository.read()).toEqual(closed);
    await repository.act({ action: 'reveal' }, '', true);
    expect(publicView(await other.read(), 'b').results).toEqual(tally(closed));
  });

  it('serializes concurrent replacements and clears without duplicate ballots', async () => {
    await open();
    await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? repository : other).act(vote(i % 2 ? 'gomez' : 'morticia'), 'same-browser', false)));
    expect((await repository.read()).votes).toHaveLength(1);
    await other.act(vote('witch'), 'same-browser', false);
    expect((await repository.read()).votes[0].entry).toBe('witch');
    await repository.act(vote(null), 'same-browser', false);
    expect((await other.read()).votes).toEqual([]);
  });

  it('orders racing votes and closure and rejects every later write', async () => {
    await open();
    const outcomes = await Promise.allSettled([
      other.act(vote('gomez'), 'before-or-after', false), close(), repository.act(vote('morticia'), 'racer', false)
    ]);
    expect(outcomes[1].status).toBe('fulfilled');
    const closed = await other.read();
    expect(closed.phase).toBe('closed');
    expect(closed.votes.length).toBe(outcomes.filter((result, i) => i !== 1 && result.status === 'fulfilled').length);
    await expect(other.act(vote(null), 'racer', false)).rejects.toThrow('not open');
    expect(await repository.read()).toEqual(closed);
  });

  it('makes a vote wait for a locked close, then validates the committed phase', async () => {
    await open();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT id FROM events WHERE id='halloween-demo' FOR UPDATE");
      const pending = other.act(vote('gomez'), 'blocked', false);
      // Attach rejection handling before releasing the lock.
      const assertion = expect(pending).rejects.toThrow('not open');
      await client.query("UPDATE events SET phase='closed' WHERE id='halloween-demo'");
      await client.query('COMMIT');
      await assertion;
      expect((await repository.read()).votes).toEqual([]);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });

  it('merges references and preserves the latest choice, including a different entry', async () => {
    await repository.act({ action: 'register', type: 'individual', title: 'Duplicate Gomez', names: 'Alex' }, '', true);
    const duplicate = (await repository.read()).entries.at(-1)!.id;
    await open();
    await repository.act(vote('gomez'), 'a', false);
    await other.act(vote(duplicate), 'a', false);
    await repository.act(vote(duplicate), 'b', false);
    await other.act(vote('morticia'), 'b', false);
    await repository.act({ action: 'merge', source: 'gomez', target: duplicate }, '', true);
    const state = await other.read();
    expect(state.votes.map(v => [v.voter, v.entry])).toEqual([['a', duplicate], ['b', 'morticia']]);
    expect(state.entries.find(e => e.id === 'addams')!.members).toEqual([duplicate, 'morticia']);
    const before = await repository.read();
    await expect(other.act({ action: 'merge', source: duplicate, target: 'morticia' }, '', true)).rejects.toThrow('two members');
    expect(await repository.read()).toEqual(before);
  });

  it('rolls back a failed write after SQL mutation has begun', async () => {
    await open();
    const before = await repository.read();
    // PostgreSQL rejects NUL in text after UPDATE/DELETE have already executed.
    await expect(other.act({ action: 'edit', id: 'gomez', title: 'bad\0title', names: 'Alex' }, '', true)).rejects.toThrow();
    expect(await repository.read()).toEqual(before);
    await repository.act(vote('gomez'), 'still-usable', false);
    expect((await other.read()).votes).toHaveLength(1);
  });

  it('enforces uniqueness, same-event references and category type at the database boundary', async () => {
    await open();
    await repository.act(vote('gomez'), 'a', false);
    await expect(pool.query("INSERT INTO votes VALUES ('halloween-demo','a','best','morticia','individual',99)")).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query("INSERT INTO votes VALUES ('halloween-demo','b','best','addams','individual',99)")).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query("INSERT INTO votes VALUES ('missing-event','c','best','gomez','individual',99)")).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query("UPDATE entries SET member_two=member_one WHERE id='addams'")).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE entries SET member_one='cosmic' WHERE id='addams'")).rejects.toMatchObject({ code: '23503' });
  });

  it('denies table visibility to a non-owner role even if SELECT is granted', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE ROLE tally_test_guest NOLOGIN');
      await client.query('GRANT USAGE ON SCHEMA public TO tally_test_guest');
      await client.query('GRANT SELECT ON events, entries, categories, votes, event_hosts TO tally_test_guest');
      await client.query('INSERT INTO event_hosts VALUES ($1,$2)', ['halloween-demo',hostUserId]);
      await client.query('SET LOCAL ROLE tally_test_guest');
      for (const table of ['events', 'entries', 'categories', 'votes', 'event_hosts']) {
        const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
        expect(result.rows[0].count).toBe(0);
      }
    } finally { await client.query('ROLLBACK'); client.release(); }
  });

  it('creates an empty named event and writes a large event in one statement per table', async () => {
    const real = new PostgresRepository(secondPool, 'real-party');
    expect(await real.seed({ empty: true, name: 'The Real Party' })).toBe(true);
    expect(await real.seed()).toBe(false);
    let state = await real.read();
    expect(state).toMatchObject({ name: 'The Real Party', entries: [], nextNumber: 1 });
    for (let i = 0; i < 70; i++) await real.act({ action: 'register', type: 'individual', title: `Costume ${i}`, names: `Guest ${i}` }, '', true);
    await real.act({ action: 'remove-category', id: 'couple' }, '', true);
    await real.act({ action: 'phase', phase: 'voting' }, '', true);
    for (let i = 0; i < 60; i++) await real.act({ action: 'vote', category: 'best', entry: `entry-${(i % 70) + 1}` }, `voter-${i}`, false);
    const statements: string[] = [];
    const counting = { query: secondPool.query.bind(secondPool), connect: async () => {
      const client = await secondPool.connect();
      return { query: (sql: string, values?: unknown[]) => { statements.push(sql); return client.query(sql, values); }, release: () => client.release() };
    } } as unknown as Pool;
    await new PostgresRepository(counting, 'real-party').act({ action: 'vote', category: 'creative', entry: 'entry-3' }, 'voter-0', false);
    // Constant cost: BEGIN, lock, 4 loads, update, 3 deletes, 3 inserts, COMMIT.
    expect(statements.filter(sql => sql.trimStart().startsWith('INSERT'))).toHaveLength(3);
    expect(statements.length).toBeLessThanOrEqual(14);
    state = await real.read();
    expect(state.entries).toHaveLength(70);
    expect(state.votes).toHaveLength(61);
    expect(tally(state).find(r => r.category.id === 'best')!.total).toBe(60);
  });

  it('isolates event data and leaves existing events unchanged on seed', async () => {
    const separate = new PostgresRepository(secondPool, 'another-party');
    await separate.seed();
    await separate.act({ action: 'register', type: 'individual', title: 'Other party', names: 'Guest' }, '', true);
    await separate.seed();
    expect((await separate.read()).entries).toHaveLength(9);
    expect((await repository.read()).entries).toHaveLength(8);
    expect((await separate.read()).id).toBe('another-party');
    await expect(pool.query("INSERT INTO votes VALUES ('halloween-demo','cross-event','best','entry-9','individual',99)")).rejects.toMatchObject({ code: '23503' });
  });

  it('keeps pending photos, private tallies and other ballots out of guest projections', async () => {
    await repository.act({ action: 'register', type: 'individual', title: 'Pending', names: 'Guest', photo: '/api/photos/private.png' }, 'a', false);
    const registration = publicView(await other.read(), 'a');
    expect(JSON.stringify(registration)).not.toContain('private.png');
    expect(registration.entries).toHaveLength(8);
    await open();
    await repository.act(vote('gomez'), 'a', false);
    await other.act(vote('morticia'), 'b', false);
    const view = publicView(await repository.read(), 'a');
    expect(view.choices).toEqual({ best: 'gomez' });
    for (const key of ['votes', 'sequence', 'nextNumber', 'ballotCount', 'results']) expect(view).not.toHaveProperty(key);
    await repository.act({ action: 'moderate', id: 'gomez', operation: 'hide' }, '', true);
    await expect(other.act(vote('addams', 'couple'), 'b', false)).rejects.toThrow('not eligible');
    expect(publicView(await repository.read(), 'a').entries.some(e => e.id === 'addams')).toBe(false);
    await close();
    expect(publicView(await repository.read(), 'a').results).toBeUndefined();
  });

  it('rejects unauthorized and wrong-phase mutations without changing persistence', async () => {
    const before = await repository.read();
    await expect(other.act({ action: 'reset' }, '', false)).rejects.toThrow('sign-in');
    await expect(other.act({ action: 'phase', phase: 'voting' }, '', false)).rejects.toThrow('sign-in');
    await expect(other.act(vote('gomez'), 'a', false)).rejects.toThrow('not open');
    expect(await repository.read()).toEqual(before);
    await open();
    await expect(other.act({ action: 'register', type: 'individual', title: 'Late', names: 'X' }, '', false)).rejects.toThrow('closed');
  });
});


describe('HTTP endpoints backed by PostgreSQL', () => {
  it('protects host actions, origins, pending photos, tallies and other ballots', async () => {
    const guest = browser(); const host = browser(); const stranger = browser();
    expect((await guest({ action: 'reset' }, true)).status).toBe(401);
    expect((await guest(vote('gomez'), false, '/api/demo', 'https://other.invalid')).status).toBe(403);
    const photoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6V7sAAAAASUVORK5CYII=';
    expect((await guest({ action: 'register', title: 'HTTP Mummy', names: 'Test guest', type: 'individual', photoData })).status).toBe(200);
    await host({ action: 'login', pin: '2468' }, true);
    const privateState = await (await host(undefined, true)).json();
    const pending = privateState.entries.find((e: { title: string }) => e.title === 'HTTP Mummy');
    expect(pending.approved).toBe(false);
    const guestState = await (await stranger(undefined, true)).json();
    expect(JSON.stringify(guestState)).not.toContain(pending.photo);
    expect((await stranger(undefined, false, pending.photo)).status).toBe(404);
    expect((await host(undefined, false, pending.photo)).status).toBe(200);
    await host({ action: 'moderate', id: pending.id, operation: 'approve' }, true);
    expect((await stranger(undefined, false, pending.photo)).status).toBe(200);
    await host({ action: 'phase', phase: 'voting' }, true);
    await guest(vote('gomez')); await stranger(vote('morticia'));
    const own = await (await guest()).json();
    expect(own.choices).toEqual({ best: 'gomez' });
    expect(own).not.toHaveProperty('votes'); expect(own).not.toHaveProperty('results'); expect(own).not.toHaveProperty('ballotCount');
    const hostView = await (await host(undefined, true)).json();
    expect(hostView.ballotCount).toBe(2);
    await host({ action: 'phase', phase: 'closed' }, true);
    expect((await guest(vote(null))).status).toBe(400);
    expect(await (await guest()).json()).not.toHaveProperty('results');
    await host({ action: 'reveal' }, true);
    expect(await (await guest()).json()).toHaveProperty('results');
    await host({ action: 'reset' }, true);
    expect((await stranger(undefined, false, pending.photo)).status).toBe(404);
  });
});

describe('couple registration through the HTTP API', () => {
  it('creates two people and one couple atomically, keeps them private and preserves both awards', async () => {
    const guest = browser(); const host = browser();
    const input = { action: 'register', type: 'couple', title: 'Night at the Museum', partners: [
      { title: 'Mummy', names: 'Avery' }, { title: 'Pharaoh', names: 'Chris' }
    ] };
    const before = await repository.read();
    const invalid = await guest({ ...input, partners: [input.partners[0], { title: '', names: 'Chris' }] });
    expect(invalid.status).toBe(400);
    expect(await repository.read()).toEqual(before);
    const response = await guest(input);
    expect(response.status).toBe(200);
    const publicState = await response.json();
    expect(publicState.entries).toHaveLength(8);
    expect(JSON.stringify(publicState)).not.toContain('Night at the Museum');
    await host({ action: 'login', pin: '2468' }, true);
    const added = (await (await host(undefined, true)).json()).entries.slice(8);
    expect(added.map((e: { type: string }) => e.type)).toEqual(['individual', 'individual', 'couple']);
    expect(added[2].members).toEqual([added[0].id, added[1].id]);
    await host({ action: 'moderate', id: added[2].id, operation: 'approve' }, true);
    expect((await (await guest()).json()).entries).toHaveLength(8);
    for (const entry of added.slice(0, 2)) await host({ action: 'moderate', id: entry.id, operation: 'approve' }, true);
    expect((await (await guest()).json()).entries).toHaveLength(11);
    await host({ action: 'phase', phase: 'voting' }, true);
    expect((await guest(vote(added[0].id))).status).toBe(200);
    expect((await guest(vote(added[2].id, 'couple'))).status).toBe(200);
    await host({ action: 'phase', phase: 'closed' }, true);
    const results = tally(await repository.read());
    expect(results[0].winners).toEqual([added[0].id]);
    expect(results[2].winners).toEqual([added[2].id]);
    expect((await guest(input)).status).toBe(400);
  });

  it('reuses an existing individual when adding a partner and can link two existing entries', async () => {
    const guest = browser();
    expect((await guest({ action: 'register', type: 'couple', title: 'Afterlife Duo', partners: [
      { entry: 'ghost' }, { title: 'Zombie', names: 'Jules' }
    ] })).status).toBe(200);
    const state = await other.read();
    expect(state.entries).toHaveLength(10);
    expect(state.entries.at(-1)!.members).toEqual(['ghost', state.entries.at(-2)!.id]);
    expect(state.entries.filter(e => e.id === 'ghost')).toHaveLength(1);
    expect((await guest({ action: 'register', type: 'couple', title: 'Space Haunts', partners: [
      { entry: 'astronaut' }, { entry: 'vampire' }
    ] })).status).toBe(200);
    expect((await repository.read()).entries).toHaveLength(11);
    const pendingId = state.entries.at(-2)!.id;
    const snapshot = await repository.read();
    expect((await guest({ action: 'register', type: 'couple', title: 'Guess', partners: [
      { entry: pendingId }, { title: 'New', names: 'Test' }
    ] })).status).toBe(400);
    expect(await repository.read()).toEqual(snapshot);
  });
});

describe('private signup receipts', () => {
  it('reuses a pending individual immediately without exposing receipts or pending entries to others', async () => {
    const guest = browser(); const stranger = browser(); const host = browser();
    const response = await guest({ action: 'register', type: 'individual', title: 'Moon Mummy', names: 'Robin' });
    const signup = await response.json();
    expect(signup.registrationReceipt).toMatch(/^[a-f0-9]{64}$/);
    expect(signup.entries).toHaveLength(8);
    const before = await repository.read();
    const original = before.entries.at(-1)!;
    expect(original.approved).toBe(false);
    expect(original.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(original.receiptHash).not.toBe(signup.registrationReceipt);
    const request = { action: 'register', type: 'couple', title: 'Moon Monsters', partners: [
      { receipt: signup.registrationReceipt }, { title: 'Star Witch', names: 'Charlie' }
    ] };
    for (const partner of [{ entry: original.id }, { receipt: '0'.repeat(64) }, { entry: original.id, receiptHash: original.receiptHash }]) {
      expect((await stranger({ ...request, partners: [partner, request.partners[1]] })).status).toBe(400);
      expect(await repository.read()).toEqual(before);
    }
    expect((await guest(request)).status).toBe(200);
    const saved = await other.read();
    expect(saved.entries).toHaveLength(11);
    expect(saved.entries.filter(e => e.title === 'Moon Mummy')).toHaveLength(1);
    expect(saved.entries.at(-1)!.members).toEqual([original.id, saved.entries.at(-2)!.id]);
    expect(saved.entries.slice(8).every(e => !e.approved)).toBe(true);
    for (const client of [guest, stranger]) {
      const view = await (await client()).json();
      expect(view.entries).toHaveLength(8);
      expect(JSON.stringify(view)).not.toContain('receiptHash');
      expect(view).not.toHaveProperty('registrationReceipt');
    }
    await host({ action: 'login', pin: '2468' }, true);
    const hostView = await (await host(undefined, true)).json();
    expect(JSON.stringify(hostView)).not.toContain('receiptHash');
    for (const entry of saved.entries.slice(8)) await host({ action: 'moderate', id: entry.id, operation: 'approve' }, true);
    await host({ action: 'phase', phase: 'voting' }, true);
    await guest(vote(original.id)); await guest(vote(saved.entries.at(-1)!.id, 'couple'));
    await host({ action: 'phase', phase: 'closed' }, true);
    await host({ action: 'reveal' }, true);
    const results = await (await stranger()).json();
    expect(JSON.stringify(results)).not.toContain('receiptHash');
    expect(results.results[0].winners).toEqual([original.id]);
    expect(results.results[2].winners).toEqual([saved.entries.at(-1)!.id]);
    expect((await guest(request)).status).toBe(400);
  });

  it('rejects old receipts after reset even when an entry number is reused', async () => {
    const guest = browser();
    const first = await (await guest({ action: 'register', type: 'individual', title: 'First', names: 'Robin' })).json();
    const oldId = (await repository.read()).entries.at(-1)!.id;
    await repository.act({ action: 'reset' }, '', true);
    await guest({ action: 'register', type: 'individual', title: 'Second', names: 'Charlie' });
    expect((await repository.read()).entries.at(-1)!.id).toBe(oldId);
    const before = await repository.read();
    expect((await guest({ action: 'register', type: 'couple', title: 'Stale', partners: [
      { receipt: first.registrationReceipt }, { title: 'Ghost', names: 'Test' }
    ] })).status).toBe(400);
    expect(await repository.read()).toEqual(before);
  });
});

describe('one-click couple approval', () => {
  it('authorizes and persists approval of all three entries through one HTTP request', async () => {
    const guest = browser(); const host = browser();
    await guest({ action: 'register', type: 'couple', title: 'Ghostly Duo', partners: [
      { title: 'Ghost', names: 'Alex' }, { title: 'Vampire', names: 'Jamie' }
    ] });
    const pending = await repository.read(); const couple = pending.entries.at(-1)!;
    const input = { action: 'moderate', id: couple.id, operation: 'approve-couple' };
    expect((await guest(input)).status).toBe(401);
    expect(await repository.read()).toEqual(pending);
    await host({ action: 'login', pin: '2468' }, true);
    expect((await host(input, true)).status).toBe(200);
    const approved = await other.read();
    expect(approved.entries.slice(8).every(e => e.approved)).toBe(true);
    expect((await (await guest()).json()).entries).toHaveLength(11);
    await open();
    await guest(vote(couple.members[0])); await guest(vote(couple.id, 'couple'));
    await close();
    const closed = await repository.read();
    expect(tally(closed)[0].winners).toEqual([couple.members[0]]);
    expect(tally(closed)[2].winners).toEqual([couple.id]);
    expect((await host(input, true)).status).toBe(400);
    expect(await repository.read()).toEqual(closed);
  });
  it('rolls back all three approvals if persistence fails mid-transaction', async () => {
    await repository.act({ action: 'register', type: 'couple', title: 'Failing Duo', partners: [
      { title: 'Ghost', names: 'Alex' }, { title: 'Vampire', names: 'Jamie' }
    ] }, '', false);
    const before = await repository.read();
    const couple = before.entries.at(-1)!;
    await pool.query(`CREATE FUNCTION fail_group_approval() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id = '${couple.id}' AND NEW.approved THEN RAISE EXCEPTION 'injected write failure'; END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER fail_group_approval BEFORE INSERT ON entries FOR EACH ROW EXECUTE FUNCTION fail_group_approval()');
    try {
      await expect(other.act({ action: 'moderate', id: couple.id, operation: 'approve-couple' }, '', true)).rejects.toThrow('injected write failure');
      expect(await repository.read()).toEqual(before);
    } finally {
      await pool.query('DROP TRIGGER fail_group_approval ON entries');
      await pool.query('DROP FUNCTION fail_group_approval()');
    }
    await repository.act({ action: 'moderate', id: couple.id, operation: 'approve-couple' }, '', true);
    expect((await other.read()).entries.slice(8).every(e => e.approved)).toBe(true);
  });
});

describe('Supabase SDK adapters against a local HTTP protocol fixture', () => {
  const credentials = { action: 'login', email: 'host@example.test', password: 'fixture-password' };
  const photoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6V7sAAAAASUVORK5CYII=';
  async function grantHost() { await pool.query('INSERT INTO event_hosts VALUES ($1,$2)', ['halloween-demo',hostUserId]); }
  it('uses verified Auth users and event membership, rejecting PINs, metadata roles and other-event hosts', async () => {
    const guest = browser(cloudOrigin);
    const view = await (await guest(undefined,true)).json();
    expect(view.authMode).toBe('supabase'); expect(view.canReset).toBe(false); expect(view.host).toBe(false);
    expect((await guest({action:'login',pin:'2468'},true)).status).toBe(400);
    expect((await guest({action:'login',email:'outsider@example.test',password:'fixture-password'},true)).status).toBe(400);
    const other = new PostgresRepository(pool,'other-auth-event'); await other.seed();
    await pool.query('INSERT INTO event_hosts VALUES ($1,$2)',['other-auth-event',otherEventUserId]);
    expect((await guest({action:'login',email:'other-event@example.test',password:'fixture-password'},true)).status).toBe(400);
    expect((await guest(credentials,true)).status).toBe(400);
    await grantHost();
    const login = await guest(credentials,true);
    expect(login.status).toBe(200);
    expect(login.headers.getSetCookie().some(cookie=>cookie.startsWith('tally_supabase') && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie))).toBe(true);
    expect((await login.json()).host).toBe(true);
    expect((await guest({action:'reset'},true)).status).toBe(403);
    await pool.query('DELETE FROM event_hosts WHERE user_id=$1',[hostUserId]);
    expect((await guest({action:'phase',phase:'voting'},true)).status).toBe(401);
    expect((await (await guest(undefined,true)).json()).host).toBe(false);
  });
  it('refreshes sessions into cookies and supports sign-out and provider-side invalidation', async () => {
    await grantHost(); const host = browser(cloudOrigin);
    const refreshBefore=service.state.refreshCount;
    expect((await host({...credentials,email:'refresh@example.test'},true)).status).toBe(200);
    expect(service.state.refreshCount).toBeGreaterThan(refreshBefore);
    expect((await (await host(undefined,true)).json()).host).toBe(true);
    expect((await host({action:'logout'},true)).status).toBe(200);
    expect((await host({action:'moderate',id:'gomez',operation:'hide'},true)).status).toBe(401);
    expect((await host(credentials,true)).status).toBe(200);
    service.revokeAll();
    expect((await host({action:'phase',phase:'voting'},true)).status).toBe(401);
  });
  it('retains the host session across a complete app-process restart', async () => {
    await grantHost(); const host=browser(cloudOrigin);
    expect((await host(credentials,true)).status).toBe(200);
    const exited=new Promise<void>(resolve=>cloudApp.once('exit',()=>resolve()));
    cloudApp.kill('SIGTERM');await exited;
    cloudApp=spawn(process.execPath,['node_modules/vite/bin/vite.js','dev','--host','127.0.0.1','--port',new URL(cloudOrigin).port,'--strictPort'],{env:cloudEnvironment,stdio:'ignore'});
    const deadline=Date.now()+20000;
    for(;;){try{if((await fetch(`${cloudOrigin}/api/demo`)).ok)break;}catch{/*startup*/}
      if(Date.now()>deadline||cloudApp.exitCode!==null)throw new Error('Restart failed');
      await new Promise(resolve=>setTimeout(resolve,150));}
    expect((await (await host(undefined,true)).json()).host).toBe(true);
    expect((await host({action:'moderate',id:'gomez',operation:'hide'},true)).status).toBe(200);
  },30000);
  it('keeps object bytes private until approval, revokes access on hide, and never exposes service credentials', async () => {
    await grantHost(); const guest=browser(cloudOrigin); const host=browser(cloudOrigin);
    expect((await host(credentials,true)).status).toBe(200);
    const registration=await guest({action:'register',type:'individual',title:'Cloud Ghost',names:'Fixture Guest',photoData});
    expect(registration.status).toBe(200);
    expect(JSON.stringify(await registration.json())).not.toContain('fixture-secret');
    const entry=(await repository.read()).entries.at(-1)!;
    expect(service.objects.size).toBe(1);
    expect([...service.objects.keys()][0]).toMatch(/^halloween-demo\/[a-f0-9]{32}\.png$/);
    const downloads=service.state.downloads;
    expect((await guest(undefined,false,entry.photo)).status).toBe(404);
    expect(service.state.downloads).toBe(downloads);
    const pending=await host(undefined,false,entry.photo);
    expect(pending.status).toBe(200);
    expect(pending.headers.get('cache-control')).toContain('no-store');
    await host({action:'moderate',id:entry.id,operation:'approve'},true);
    expect((await guest(undefined,false,entry.photo)).status).toBe(200);
    await host({action:'moderate',id:entry.id,operation:'hide'},true);
    expect((await guest(undefined,false,entry.photo)).status).toBe(404);
    const direct=await fetch(`${service.url}/storage/v1/object/costume-photos/${[...service.objects.keys()][0]}`);
    expect(direct.status).toBe(403);
    expect(await (await guest(undefined,true)).json()).not.toHaveProperty('results');
  });
  it('cleans up uploads on failed registration and never falls back to local files or public buckets', async () => {
    const guest=browser(cloudOrigin);
    for (const invalid of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YmFk', `data:image/png;base64,${Buffer.alloc(2_000_001).toString('base64')}`]) {
      expect((await guest({action:'register',type:'individual',title:'Invalid photo',names:'Fixture',photoData:invalid})).status).toBe(400);
      expect(service.objects.size).toBe(0);
    }
    expect((await guest({action:'register',type:'individual',title:'Invalid',names:'',photoData})).status).toBe(400);
    expect(service.objects.size).toBe(0); expect((await repository.read()).entries).toHaveLength(8);
    service.state.publicBucket=true;
    expect((await guest({action:'register',type:'individual',title:'Public denied',names:'Fixture',photoData})).status).toBe(400);
    expect(service.objects.size).toBe(0);
    service.state.publicBucket=false; service.state.failStorage=true;
    expect((await guest({action:'register',type:'individual',title:'Unavailable',names:'Fixture',photoData})).status).toBe(400);
    expect((await repository.read()).entries).toHaveLength(8);
    // No photo is required even while external storage is down.
    expect((await guest({action:'register',type:'individual',title:'No photo',names:'Fixture'})).status).toBe(200);
    expect((await repository.read()).entries.at(-1)!.photo).toBeUndefined();
  });
});
