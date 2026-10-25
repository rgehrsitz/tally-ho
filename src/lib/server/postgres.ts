import { Pool, type PoolClient } from 'pg';
import { applyAction, seedParty, type Party } from '../domain';

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
        if (!host) throw new Error('Host sign-in required.');
        Object.assign(state, seedParty(), { id: this.eventId });
      } else applyAction(state, input, voter, host);
      await this.write(client, state);
      await client.query('COMMIT');
      return state;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  /** Explicit, non-destructive seed. No seeding or migrations in guest requests. */
  async seed(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const state = { ...seedParty(), id: this.eventId };
      const inserted = await client.query('INSERT INTO events (id, name, phase, revealed, sequence, next_number) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id', [state.id, state.name, state.phase, state.revealed, state.sequence, state.nextNumber]);
      if (inserted.rowCount) await this.write(client, state);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
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
      entries: entries.rows.map(e => ({ id: e.id, number: e.number, title: e.title, names: e.names, type: e.type,
        approved: e.approved, hidden: e.hidden, icon: e.icon,
        members: e.type === 'couple' ? [e.member_one, e.member_two] : [], ...(e.photo ? { photo: e.photo } : {}), ...(e.receipt_hash ? { receiptHash: e.receipt_hash } : {}) })),
      categories: categories.rows, votes: votes.rows
    };
  }

  private async write(client: PoolClient, state: Party): Promise<void> {
    const id = this.eventId;
    await client.query('UPDATE events SET name=$2, phase=$3, revealed=$4, sequence=$5, next_number=$6 WHERE id=$1', [id, state.name, state.phase, state.revealed, state.sequence, state.nextNumber]);
    await client.query('DELETE FROM votes WHERE event_id=$1', [id]);
    await client.query('DELETE FROM entries WHERE event_id=$1', [id]);
    await client.query('DELETE FROM categories WHERE event_id=$1', [id]);
    for (const e of state.entries) await client.query('INSERT INTO entries (event_id,id,number,title,names,type,approved,hidden,icon,photo,member_one,member_two,receipt_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [id,e.id,e.number,e.title,e.names,e.type,e.approved,e.hidden,e.icon,e.photo ?? null,e.members[0] ?? null,e.members[1] ?? null,e.receiptHash ?? null]);
    for (const [position,c] of state.categories.entries()) await client.query('INSERT INTO categories (event_id,id,name,type,position) VALUES ($1,$2,$3,$4,$5)', [id,c.id,c.name,c.type,position]);
    for (const v of state.votes) await client.query('INSERT INTO votes (event_id,voter,category,entry,entry_type,sequence) VALUES ($1,$2,$3,$4,$5,$6)', [id,v.voter,v.category,v.entry,state.categories.find(c => c.id === v.category)!.type,v.sequence]);
  }
}
