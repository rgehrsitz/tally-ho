export type Phase = 'registration' | 'voting' | 'closed';
export type EntryType = 'individual' | 'couple';
export interface Entry {
  id: string; number: number; title: string; names: string; type: EntryType;
  members: string[]; approved: boolean; hidden: boolean; icon: string; photo?: string; receiptHash?: string;
}
export interface Category { id: string; name: string; type: EntryType; }
export interface Vote { voter: string; category: string; entry: string; sequence: number; }
export interface Party {
  version: 1; id: string; name: string; phase: Phase; revealed: boolean;
  entries: Entry[]; categories: Category[]; votes: Vote[]; sequence: number; nextNumber: number;
}
export interface Result { category: Category; total: number; rows: { entry: Entry; count: number }[]; winners: string[]; }
export interface PublicParty extends Omit<Party, 'votes' | 'sequence' | 'nextNumber'> {
  choices: Record<string, string>; results?: Result[]; ballotCount?: number; host: boolean;
}
export function seedParty(): Party {
  const entries: Entry[] = [
    { id: 'gomez', number: 1, title: 'Gomez Addams', names: 'Alex', icon: '🌹', type: 'individual', members: [], approved: true, hidden: false },
    { id: 'morticia', number: 2, title: 'Morticia Addams', names: 'Jamie', icon: '🕷️', type: 'individual', members: [], approved: true, hidden: false },
    { id: 'witch', number: 3, title: 'The Garden Witch', names: 'Sam', icon: '🌿', type: 'individual', members: [], approved: true, hidden: false },
    { id: 'astronaut', number: 4, title: 'Lost in Space', names: 'Riley', icon: '🪐', type: 'individual', members: [], approved: true, hidden: false },
    { id: 'ghost', number: 5, title: 'A Very Tired Ghost', names: 'Morgan', icon: '👻', type: 'individual', members: [], approved: true, hidden: false },
    { id: 'vampire', number: 6, title: 'Count After Hours', names: 'Taylor', icon: '🦇', type: 'individual', members: [], approved: true, hidden: false },
    { id: 'addams', number: 7, title: 'The Addamses', names: 'Alex & Jamie', icon: '🖤', type: 'couple', members: ['gomez', 'morticia'], approved: true, hidden: false },
    { id: 'cosmic', number: 8, title: 'Moonlight & Magic', names: 'Sam & Riley', icon: '✨', type: 'couple', members: ['witch', 'astronaut'], approved: true, hidden: false }
  ];
  return { version: 1, id: 'halloween-demo', name: 'The Halloween Social', phase: 'registration', revealed: false,
    entries, categories: [ { id: 'best', name: 'Best Costume', type: 'individual' }, { id: 'creative', name: 'Most Creative', type: 'individual' }, { id: 'couple', name: 'Best Couple', type: 'couple' } ],
    votes: [], sequence: 0, nextNumber: 9 };
}
export function eligible(party: Party | PublicParty, entry: Entry, category: Category): boolean {
  return entry.approved && !entry.hidden && entry.type === category.type &&
    (entry.type === 'individual' || (entry.members.length === 2 && new Set(entry.members).size === 2 && entry.members.every(id => party.entries.some(e => e.id === id && e.type === 'individual' && e.approved && !e.hidden))));
}
export function tally(party: Party): Result[] {
  return party.categories.map(category => {
    const rows = party.entries.filter(entry => eligible(party, entry, category)).map(entry => ({ entry, count: party.votes.filter(v => v.category === category.id && v.entry === entry.id).length })).sort((a, b) => b.count - a.count || a.entry.number - b.entry.number);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return { category, rows, total, winners: total ? rows.filter(row => row.count === rows[0].count).map(row => row.entry.id) : [] };
  });
}
export function publicView(party: Party, voter: string, host = false): PublicParty {
  const { votes, sequence: _sequence, nextNumber: _nextNumber, ...rest } = party;
  const entries = host ? party.entries : party.entries.filter(e => e.approved && !e.hidden && (e.type === 'individual' || e.members.every(id => party.entries.some(p => p.id === id && p.approved && !p.hidden))));
  const choices = Object.fromEntries(votes.filter(v => v.voter === voter && entries.some(e => e.id === v.entry)).map(v => [v.category, v.entry]));
  const sanitize = ({ receiptHash: _receiptHash, ...entry }: Entry): Entry => entry;
  return { ...rest, entries: entries.map(sanitize), choices, host, ...(host || (party.phase === 'closed' && party.revealed) ? { results: tally(party).map(result => ({ ...result, rows: result.rows.map(row => ({ ...row, entry: sanitize(row.entry) })) })) } : {}), ...(host ? { ballotCount: new Set(votes.map(v => v.voter)).size } : {}) };
}
function text(value: unknown, label: string, max = 80): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
function kind(value: unknown): EntryType {
  if (value !== 'individual' && value !== 'couple') throw new Error('Choose individual or couple.');
  return value;
}
export function applyAction(party: Party, input: Record<string, unknown>, voter: string, host: boolean): void {
  const action = input.action;
  if (action !== 'register' && action !== 'vote' && !host) throw new Error('Host sign-in required.');
  if (action === 'register') {
    if (party.phase !== 'registration') throw new Error('Registration is closed.');
    const type = kind(input.type);
    const title = text(input.title, type === 'couple' ? 'Couple costume name' : 'Costume name');
    // Stage the complete registration before mutating state. A couple can reuse
    // existing individuals, add new ones, or do both in one atomic action.
    const added: Entry[] = [];
    let nextNumber = party.nextNumber;
    const members: string[] = [];
    if (type === 'couple') {
      const partners = input.partners ?? (Array.isArray(input.members) ? input.members.map(entry => ({ entry })) : null);
      if (!Array.isArray(partners) || partners.length !== 2) throw new Error('Enter two people for your couple.');
      for (const [index, value] of partners.entries()) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter two people for your couple.');
        const partner = value as Record<string, unknown>;
        if (partner.receiptHash !== undefined) {
          const entry = party.entries.find(e => e.type === 'individual' && !e.hidden && e.receiptHash && e.receiptHash === partner.receiptHash);
          if (!entry) throw new Error('This signup receipt is no longer available. Ask your host to help link your entry.');
          members.push(entry.id);
        } else if (partner.entry !== undefined) {
          const entry = party.entries.find(e => e.id === partner.entry && e.type === 'individual' && !e.hidden && (e.approved || host));
          if (!entry) throw new Error('Choose an available individual entry, or ask your host to link a pending entry.');
          members.push(entry.id);
        } else {
          const names = text(partner.names, `Person ${index + 1} display name`);
          const costume = text(partner.title, `Person ${index + 1} costume name`);
          const number = nextNumber++;
          const entry: Entry = { id: `entry-${number}`, number, title: costume, names, type: 'individual', members: [], approved: host, hidden: false, icon: '🎭' };
          added.push(entry);
          members.push(entry.id);
        }
      }
      if (new Set(members).size !== 2) throw new Error('Choose two different people.');
      if (party.entries.some(e => e.type === 'couple' && !e.hidden && members.every(m => e.members.includes(m)))) throw new Error('These two costumes already have a couple entry.');
    }
    if (party.entries.length + added.length + 1 > 120) throw new Error('This demo has reached its entry limit.');
    const names = type === 'couple' ? members.map(id => [...party.entries, ...added].find(e => e.id === id)!.names).join(' & ') : text(input.names, 'Display name');
    const number = nextNumber++;
    added.push({ id: `entry-${number}`, number, title, names, type, members, approved: host, hidden: false, icon: type === 'couple' ? '✨' : '🎭', ...(typeof input.photo === 'string' ? { photo: input.photo } : {}), ...(type === 'individual' && typeof input.receiptHash === 'string' ? { receiptHash: input.receiptHash } : {}) });
    party.entries.push(...added);
    party.nextNumber = nextNumber;
  } else if (action === 'vote') {
    if (party.phase !== 'voting') throw new Error('Voting is not open. Your ballot has not changed.');
    const category = party.categories.find(c => c.id === input.category);
    if (!category) throw new Error('Unknown category.');
    if (input.entry !== null) {
      const entry = party.entries.find(e => e.id === input.entry);
      if (!entry || !eligible(party, entry, category)) throw new Error('That entry is not eligible for this category.');
    }
    party.votes = party.votes.filter(v => !(v.voter === voter && v.category === category.id));
    if (input.entry !== null) party.votes.push({ voter, category: category.id, entry: input.entry as string, sequence: ++party.sequence });
  } else if (action === 'phase') {
    const next = party.phase === 'registration' ? 'voting' : party.phase === 'voting' ? 'closed' : null;
    if (input.phase !== next || !next) throw new Error('Move from registration to voting, then close voting.');
    if (next === 'voting' && (!party.categories.length || party.categories.some(c => !party.entries.some(e => eligible(party, e, c))))) throw new Error('Each category needs at least one approved eligible entry.');
    party.phase = next;
  } else if (action === 'reveal') {
    if (party.phase !== 'closed') throw new Error('Close voting before revealing results.');
    party.revealed = !party.revealed;
  } else if (action === 'category' || action === 'remove-category') {
    if (party.phase !== 'registration') throw new Error('Categories are locked once voting opens.');
    if (action === 'remove-category') party.categories = party.categories.filter(c => c.id !== input.id);
    else {
      if (party.categories.length >= 12) throw new Error('This demo supports up to 12 categories.');
      const name = text(input.name, 'Category name', 50);
      if (party.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) throw new Error('That category already exists.');
      party.categories.push({ id: `category-${++party.sequence}`, name, type: kind(input.type) });
    }
  } else if (action === 'moderate' || action === 'edit') {
    if (party.phase === 'closed') throw new Error('Results are final. Reset the demo to start over.');
    const entry = party.entries.find(e => e.id === input.id);
    if (!entry) throw new Error('Entry not found.');
    if (action === 'edit') { entry.title = text(input.title, 'Costume name'); entry.names = text(input.names, 'Display name'); }
    else if (input.operation === 'approve-couple') {
      if (entry.type !== 'couple' || entry.members.length !== 2 || new Set(entry.members).size !== 2) throw new Error('Choose a couple linked to two different individuals.');
      const members = entry.members.map(id => party.entries.find(e => e.id === id && e.type === 'individual'));
      if (members.some(member => !member)) throw new Error('Both linked individual entries must exist.');
      if (entry.hidden || members.some(member => member!.hidden)) throw new Error('Restore the couple and both people before approving them together.');
      // Validate the whole group first, then approve within the repository's
      // existing event transaction. Hidden entries are never silently restored.
      entry.approved = true;
      for (const member of members) member!.approved = true;
    }
    else if (input.operation === 'approve') entry.approved = true;
    else if (input.operation === 'hide') entry.hidden = !entry.hidden;
    else throw new Error('Unknown moderation operation.');
  } else if (action === 'merge') {
    if (party.phase === 'closed') throw new Error('Results are final.');
    const source = party.entries.find(e => e.id === input.source);
    const target = party.entries.find(e => e.id === input.target);
    if (!source || !target || source.id === target.id || source.type !== target.type) throw new Error('Choose two different entries of the same type.');
    if (party.entries.some(e => e.type === 'couple' && e.members.includes(source.id) && e.members.includes(target.id))) throw new Error('Cannot merge the two members of one couple.');
    const latest = new Map<string, Vote>();
    for (const vote of party.votes) {
      const moved = { ...vote, entry: vote.entry === source.id ? target.id : vote.entry };
      const key = JSON.stringify([moved.voter, moved.category]);
      if (!latest.has(key) || latest.get(key)!.sequence < moved.sequence) latest.set(key, moved);
    }
    party.votes = [...latest.values()];
    party.entries = party.entries.filter(e => e.id !== source.id).map(e => ({ ...e, members: e.members.map(id => id === source.id ? target.id : id) }));
  } else throw new Error('Unknown action.');
}
