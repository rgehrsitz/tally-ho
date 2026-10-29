import { Pool, type PoolClient } from 'pg';
import { applyAction, RuleError, seedParty, type Entry, type Party, type SeedOptions } from '../domain';

/** All writers lock the event before loading it. At party scale, replacing this
 * bounded graph is simpler than separate implementations of merge/vote rules.
 * Constraints and the transaction protect the complete replacement on failure.
 * Reads use a repeatable snapshot so they cannot mix two committed versions. */
export class PostgresRepository {
  constructor(readonly pool: Pool, readonly eventId = 'halloween-demo') {}

  async read(): Promise<Party> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const state = await this.load(client);
      await client.query('COMMIT');
      return state;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async act(input: Record<string, unknown>, voter: string, host: boolean): Promise<Party> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [this.eventId]);
      if (!locked.rowCount) throw new Error('Event not found. Run npm run db:seed.');
      const state = await this.load(client);
      if (input.action === 'reset') {
        if (!host) throw new RuleError('Host sign-in required.');
        Object.assign(state, seedParty(), { id: this.eventId });
      } else applyAction(state, input, voter, host);
      await this.write(client, state);
      await client.query('COMMIT');
      return state;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  /** Explicit, non-destructive seed. No seeding or migrations in guest requests. */
  async seed(options: SeedOptions = {}): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const state = { ...seedParty(options), id: this.eventId };
      const inserted = await client.query('INSERT INTO events (id, name, phase, revealed, sequence, next_number) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id', [state.id, state.name, state.phase, state.revealed, state.sequence, state.nextNumber]);
      if (inserted.rowCount) await this.write(client, state);
      await client.query('COMMIT');
      return !!inserted.rowCount;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  /** Entries alone, for photo access checks that don't need ballots. */
  async entries(): Promise<Entry[]> {
    const { rows } = await this.pool.query('SELECT * FROM entries WHERE event_id=$1 ORDER BY number', [this.eventId]);
    return rows.map(toEntry);
  }

  private async load(client: PoolClient): Promise<Party> {
    const { rows: [event] } = await client.query('SELECT * FROM events WHERE id=$1', [this.eventId]);
    if (!event) throw new Error('Event not found. Run npm run db:seed.');
    const entries = await client.query('SELECT * FROM entries WHERE event_id=$1 ORDER BY number', [this.eventId]);
    const categories = await client.query('SELECT id, name, type FROM categories WHERE event_id=$1 ORDER BY position', [this.eventId]);
    const votes = await client.query('SELECT voter, category, entry, sequence FROM votes WHERE event_id=$1 ORDER BY sequence', [this.eventId]);
    return {
      version: 1, id: event.id, name: event.name, phase: event.phase, revealed: event.revealed,
      sequence: event.sequence, nextNumber: event.next_number,
      entries: entries.rows.map(toEntry),
      categories: categories.rows, votes: votes.rows
    };
  }

  /** One multi-row INSERT per table via unnest(), so a write costs the same
   * handful of round trips at 10 votes or 500 while the event lock is held. */
  private async write(client: PoolClient, state: Party): Promise<void> {
    const id = this.eventId;
    const { entries: e, categories: c, votes: v } = state;
    const typeOf = new Map(c.map(category => [category.id, category.type]));
    await client.query('UPDATE events SET name=$2, phase=$3, revealed=$4, sequence=$5, next_number=$6 WHERE id=$1', [id, state.name, state.phase, state.revealed, state.sequence, state.nextNumber]);
    await client.query('DELETE FROM votes WHERE event_id=$1', [id]);
    await client.query('DELETE FROM entries WHERE event_id=$1', [id]);
    await client.query('DELETE FROM categories WHERE event_id=$1', [id]);
    if (e.length) await client.query(`INSERT INTO entries (event_id,id,number,title,names,type,approved,hidden,icon,photo,member_one,member_two,receipt_hash)
      SELECT $1::text, * FROM unnest($2::text[],$3::int[],$4::text[],$5::text[],$6::text[],$7::bool[],$8::bool[],$9::text[],$10::text[],$11::text[],$12::text[],$13::text[])`,
      [id, e.map(x => x.id), e.map(x => x.number), e.map(x => x.title), e.map(x => x.names), e.map(x => x.type), e.map(x => x.approved), e.map(x => x.hidden),
        e.map(x => x.icon), e.map(x => x.photo ?? null), e.map(x => x.members[0] ?? null), e.map(x => x.members[1] ?? null), e.map(x => x.receiptHash ?? null)]);
    if (c.length) await client.query('INSERT INTO categories (event_id,id,name,type,position) SELECT $1::text, * FROM unnest($2::text[],$3::text[],$4::text[],$5::int[])',
      [id, c.map(x => x.id), c.map(x => x.name), c.map(x => x.type), c.map((_, position) => position)]);
    if (v.length) await client.query('INSERT INTO votes (event_id,voter,category,entry,entry_type,sequence) SELECT $1::text, * FROM unnest($2::text[],$3::text[],$4::text[],$5::text[],$6::int[])',
      [id, v.map(x => x.voter), v.map(x => x.category), v.map(x => x.entry), v.map(x => typeOf.get(x.category)!), v.map(x => x.sequence)]);
  }
}

function toEntry(e: Record<string, any>): Entry {
  return { id: e.id, number: e.number, title: e.title, names: e.names, type: e.type, approved: e.approved, hidden: e.hidden, icon: e.icon,
    members: e.type === 'couple' ? [e.member_one, e.member_two] : [], ...(e.photo ? { photo: e.photo } : {}), ...(e.receipt_hash ? { receiptHash: e.receipt_hash } : {}) };
}
