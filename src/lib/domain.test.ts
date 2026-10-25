import { describe, expect, it } from 'vitest';
import { applyAction, eligible, publicView, seedParty, tally } from './domain';
const vote = (category: string, entry: string | null) => ({ action: 'vote', category, entry });
describe('party voting rules', () => {
  it('lets one costume win individually and with its couple', () => {
    const party = seedParty(); party.phase = 'voting';
    applyAction(party, vote('best', 'gomez'), 'voter', false);
    applyAction(party, vote('couple', 'addams'), 'voter', false);
    expect(tally(party).find(r => r.category.id === 'best')?.winners).toEqual(['gomez']);
    expect(tally(party).find(r => r.category.id === 'couple')?.winners).toEqual(['addams']);
  });
  it('edits a ballot without increasing its vote count and supports skipping', () => {
    const party = seedParty(); party.phase = 'voting';
    applyAction(party, vote('best', 'gomez'), 'voter', false);
    applyAction(party, vote('best', 'morticia'), 'voter', false);
    expect(party.votes).toHaveLength(1); expect(party.votes[0].entry).toBe('morticia');
    applyAction(party, vote('best', null), 'voter', false); expect(party.votes).toHaveLength(0);
  });
  it('enforces phase and eligibility on the server domain', () => {
    const party = seedParty();
    expect(() => applyAction(party, vote('best', 'gomez'), 'voter', false)).toThrow('not open');
    applyAction(party, { action: 'phase', phase: 'voting' }, '', true);
    expect(() => applyAction(party, vote('best', 'addams'), 'voter', false)).toThrow('not eligible');
    expect(() => applyAction(party, { action: 'register', type: 'individual', title: 'Late', names: 'Guest' }, '', false)).toThrow('closed');
    applyAction(party, { action: 'phase', phase: 'closed' }, '', true);
    expect(() => applyAction(party, vote('best', 'gomez'), 'voter', false)).toThrow('not open');
    expect(() => applyAction(party, { action: 'phase', phase: 'voting' }, '', true)).toThrow();
  });
  it('hides tallies and other ballots until the host reveals closed results', () => {
    const party = seedParty(); party.phase = 'voting';
    applyAction(party, vote('best', 'gomez'), 'a', false);
    applyAction(party, vote('best', 'morticia'), 'b', false);
    const view = publicView(party, 'a');
    expect(view).not.toHaveProperty('votes'); expect(view).not.toHaveProperty('ballotCount'); expect(view).not.toHaveProperty('results'); expect(view.choices).toEqual({ best: 'gomez' });
    expect(publicView(party, 'a', true).ballotCount).toBe(2);
    party.phase = 'closed'; expect(publicView(party, 'a').results).toBeUndefined();
    applyAction(party, { action: 'reveal' }, '', true);
    expect(publicView(party, 'a').results?.[0].winners).toHaveLength(2);
  });
  it('merges duplicates while preserving the latest ballot choice and couple membership', () => {
    const party = seedParty();
    applyAction(party, { action: 'register', type: 'individual', title: 'Duplicate Gomez', names: 'Alex' }, '', true);
    const duplicate = party.entries.at(-1)!.id; party.phase = 'voting';
    applyAction(party, vote('best', 'gomez'), 'a', false);
    applyAction(party, vote('best', duplicate), 'a', false);
    applyAction(party, vote('best', duplicate), 'b', false);
    applyAction(party, vote('best', 'morticia'), 'b', false);
    applyAction(party, { action: 'merge', source: 'gomez', target: duplicate }, '', true);
    expect(party.votes).toHaveLength(2); expect(party.votes.find(v => v.voter === 'a')?.entry).toBe(duplicate);
    expect(party.votes.find(v => v.voter === 'b')?.entry).toBe('morticia');
    expect(party.entries.find(e => e.id === 'addams')?.members).toContain(duplicate);
    expect(party.entries.some(e => e.id === 'gomez')).toBe(false);
  });
  it('rejects invalid couples and keeps guest registrations pending', () => {
    const party = seedParty();
    expect(() => applyAction(party, { action: 'register', type: 'couple', title: 'Oops', members: ['gomez', 'gomez'] }, '', false)).toThrow();
    expect(() => applyAction(party, { action: 'register', type: 'couple', title: 'Duplicate', members: ['morticia', 'gomez'] }, '', false)).toThrow('already');
    applyAction(party, { action: 'register', type: 'individual', title: 'Mummy', names: 'Guest' }, '', false);
    expect(publicView(party, '').entries).toHaveLength(8); expect(publicView(party, '', true).entries).toHaveLength(9);
  });
  it('hiding one member makes its couple ineligible and removes it from the gallery', () => {
    const party = seedParty(); applyAction(party, { action: 'moderate', id: 'gomez', operation: 'hide' }, '', true);
    expect(eligible(party, party.entries.find(e => e.id === 'addams')!, party.categories[2])).toBe(false);
    expect(publicView(party, '').entries.some(e => e.id === 'addams')).toBe(false);
  });
  it('protects host operations and freezes categories after opening', () => {
    const party = seedParty();
    expect(() => applyAction(party, { action: 'phase', phase: 'voting' }, '', false)).toThrow('sign-in');
    expect(() => applyAction(party, { action: 'reveal' }, '', true)).toThrow('Close');
    party.phase = 'voting'; expect(() => applyAction(party, { action: 'category', name: 'New', type: 'individual' }, '', true)).toThrow('locked');
  });
  it('shows no winner without votes and all tied winners with votes', () => {
    const party = seedParty(); expect(tally(party)[0].winners).toEqual([]); party.phase = 'voting';
    applyAction(party, vote('best', 'gomez'), 'a', false); applyAction(party, vote('best', 'morticia'), 'b', false);
    expect(tally(party)[0].winners).toEqual(['gomez', 'morticia']);
  });
});
