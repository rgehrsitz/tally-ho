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

describe('couple signup', () => {
  it('registers two new individuals and their linked couple in one submission', () => {
    const party = seedParty();
    applyAction(party, { action: 'register', type: 'couple', title: 'The Spooky Duo', partners: [
      { title: 'Skeleton', names: 'Pat' }, { title: 'Disco Ghost', names: 'Lee' }
    ] }, 'browser', false);
    const added = party.entries.slice(8);
    expect(added.map(e => e.type)).toEqual(['individual', 'individual', 'couple']);
    expect(added[2].members).toEqual(added.slice(0, 2).map(e => e.id));
    expect(added.every(e => !e.approved)).toBe(true);
    expect(publicView(party, 'browser').entries).toHaveLength(8);
    added.forEach(e => applyAction(party, { action: 'moderate', id: e.id, operation: 'approve' }, '', true));
    party.phase = 'voting';
    applyAction(party, { action: 'vote', category: 'best', entry: added[0].id }, 'browser', false);
    applyAction(party, { action: 'vote', category: 'couple', entry: added[2].id }, 'browser', false);
    expect(tally(party).find(r => r.category.id === 'best')!.winners).toEqual([added[0].id]);
    expect(tally(party).find(r => r.category.id === 'couple')!.winners).toEqual([added[2].id]);
  });
  it('adds a new partner to an existing individual without duplicating that individual', () => {
    const party = seedParty();
    applyAction(party, { action: 'register', type: 'couple', title: 'Night Shift', partners: [
      { entry: 'ghost' }, { title: 'Mummy', names: 'Jo' }
    ] }, '', false);
    expect(party.entries).toHaveLength(10);
    expect(party.entries.at(-1)!.members).toEqual(['ghost', party.entries.at(-2)!.id]);
    expect(party.entries.filter(e => e.id === 'ghost')).toHaveLength(1);
  });
  it('validates the whole signup before adding any entries or consuming numbers', () => {
    const party = seedParty(); const before = structuredClone(party);
    for (const partners of [
      [{ title: 'Valid', names: 'Pat' }, { title: '', names: 'Lee' }],
      [{ entry: 'ghost' }, { entry: 'ghost' }],
      [{ entry: 'addams' }, { title: 'New', names: 'Pat' }],
      [{ entry: 'missing' }, { title: 'New', names: 'Pat' }]
    ]) {
      expect(() => applyAction(party, { action: 'register', type: 'couple', title: 'Duo', partners }, '', false)).toThrow();
      expect(party).toEqual(before);
    }
  });
  it('lets hosts link pending entries while guests cannot discover or link them', () => {
    const party = seedParty();
    applyAction(party, { action: 'register', type: 'individual', title: 'Pending', names: 'Pat' }, '', false);
    const pending = party.entries.at(-1)!;
    const input = { action: 'register', type: 'couple', title: 'Duo', partners: [{ entry: pending.id }, { entry: 'ghost' }] };
    expect(() => applyAction(party, input, '', false)).toThrow();
    applyAction(party, input, '', true);
    expect(eligible(party, party.entries.at(-1)!, party.categories[2])).toBe(false);
    expect(publicView(party, '').entries).toHaveLength(8);
  });
});

it('reserves room for every entry in a couple signup without partial registration', () => {
  const party = seedParty();
  for (let number = 9; number <= 119; number++) party.entries.push({ ...party.entries[0], id: `entry-${number}`, number });
  party.nextNumber = 120;
  const before = structuredClone(party);
  expect(() => applyAction(party, { action: 'register', type: 'couple', title: 'Duo', partners: [
    { title: 'Ghost', names: 'Pat' }, { title: 'Witch', names: 'Lee' }
  ] }, '', false)).toThrow('entry limit');
  expect(party).toEqual(before);
});

describe('approve a couple and both individuals', () => {
  function pendingGroup() {
    const party = seedParty();
    applyAction(party, { action: 'register', type: 'couple', title: 'Spooky Duo', partners: [
      { title: 'Skeleton', names: 'Pat' }, { title: 'Witch', names: 'Lee' }
    ] }, '', false);
    return party;
  }
  it('approves exactly the linked group, including an already-approved couple', () => {
    const party = pendingGroup();
    const couple = party.entries.at(-1)!;
    applyAction(party, { action: 'register', type: 'individual', title: 'Unrelated', names: 'Other' }, '', false);
    couple.approved = true;
    applyAction(party, { action: 'moderate', id: couple.id, operation: 'approve-couple' }, '', true);
    expect(party.entries.slice(8, 11).every(e => e.approved)).toBe(true);
    expect(party.entries.at(-1)!.approved).toBe(false);
    expect(eligible(party, couple, party.categories[2])).toBe(true);
    expect(eligible(party, party.entries[8], party.categories[0])).toBe(true);
    const before = structuredClone(party);
    applyAction(party, { action: 'moderate', id: couple.id, operation: 'approve-couple' }, '', true);
    expect(party).toEqual(before);
  });
  it('requires a host and rejects closed events without partial approval', () => {
    const party = pendingGroup();
    const input = { action: 'moderate', id: party.entries.at(-1)!.id, operation: 'approve-couple' };
    const before = structuredClone(party);
    expect(() => applyAction(party, input, '', false)).toThrow('sign-in');
    expect(party).toEqual(before);
    party.phase = 'closed';
    const closed = structuredClone(party);
    expect(() => applyAction(party, input, '', true)).toThrow('final');
    expect(party).toEqual(closed);
  });
  it('validates all linked members before changing any approval', () => {
    for (const members of [['entry-9', 'missing'], ['entry-9', 'entry-9'], ['entry-9', 'addams']]) {
      const party = pendingGroup(); const couple = party.entries.at(-1)!;
      couple.members = members;
      const before = structuredClone(party);
      expect(() => applyAction(party, { action: 'moderate', id: couple.id, operation: 'approve-couple' }, '', true)).toThrow();
      expect(party).toEqual(before);
    }
  });
  it('does not restore or partially approve hidden entries', () => {
    const party = pendingGroup(); const couple = party.entries.at(-1)!;
    party.entries[9].hidden = true;
    const before = structuredClone(party);
    expect(() => applyAction(party, { action: 'moderate', id: couple.id, operation: 'approve-couple' }, '', true)).toThrow('Restore');
    expect(party).toEqual(before);
    party.entries[9].hidden = false;
    applyAction(party, { action: 'moderate', id: couple.id, operation: 'approve-couple' }, '', true);
    expect(party.entries.slice(8).every(e => e.approved)).toBe(true);
  });
});

describe('party readiness', () => {
  it('starts a real event empty under its own name', () => {
    const party = seedParty({ empty: true, name: 'Smith Halloween 2026' });
    expect(party.entries).toEqual([]);
    expect(party.name).toBe('Smith Halloween 2026');
    expect(party.categories.length).toBeGreaterThan(0);
    applyAction(party, { action: 'register', type: 'individual', title: 'Pumpkin', names: 'Kit' }, '', false);
    expect(party.entries[0].number).toBe(1);
    expect(() => seedParty({ name: ' ' })).toThrow('Event name');
  });
  it('frees entry slots when a host hides junk signups', () => {
    const party = seedParty();
    for (let number = 9; number <= 120; number++) party.entries.push({ ...party.entries[0], id: `entry-${number}`, number, hidden: true });
    party.nextNumber = 121;
    applyAction(party, { action: 'register', type: 'individual', title: 'Real guest', names: 'Ana' }, '', false);
    expect(party.entries.at(-1)!.title).toBe('Real guest');
  });
  it('rejects a merge that would leave two identical couples', () => {
    const party = seedParty();
    applyAction(party, { action: 'register', type: 'individual', title: 'Gomez again', names: 'Alex' }, '', true);
    const duplicate = party.entries.at(-1)!.id;
    applyAction(party, { action: 'register', type: 'couple', title: 'Addams II', partners: [{ entry: duplicate }, { entry: 'morticia' }] }, '', true);
    const before = structuredClone(party);
    expect(() => applyAction(party, { action: 'merge', source: duplicate, target: 'gomez' }, '', true)).toThrow('identical couples');
    expect(party).toEqual(before);
  });
  it('counts hidden couples when checking merges, and blocks restoring a duplicate couple', () => {
    const party = seedParty();
    applyAction(party, { action: 'register', type: 'individual', title: 'Gomez again', names: 'Alex' }, '', true);
    const duplicate = party.entries.at(-1)!.id;
    applyAction(party, { action: 'register', type: 'couple', title: 'Addams II', partners: [{ entry: duplicate }, { entry: 'morticia' }] }, '', true);
    const second = party.entries.at(-1)!.id;
    applyAction(party, { action: 'moderate', id: second, operation: 'hide' }, '', true);
    expect(() => applyAction(party, { action: 'merge', source: duplicate, target: 'gomez' }, '', true)).toThrow('identical couples');
    applyAction(party, { action: 'moderate', id: 'addams', operation: 'hide' }, '', true);
    applyAction(party, { action: 'register', type: 'couple', title: 'Addams III', partners: [{ entry: 'gomez' }, { entry: 'morticia' }] }, '', true);
    expect(() => applyAction(party, { action: 'moderate', id: 'addams', operation: 'hide' }, '', true)).toThrow('Merge the duplicate');
    applyAction(party, { action: 'merge', source: 'addams', target: party.entries.at(-1)!.id }, '', true);
    expect(party.entries.some(e => e.id === 'addams')).toBe(false);
  });
});
