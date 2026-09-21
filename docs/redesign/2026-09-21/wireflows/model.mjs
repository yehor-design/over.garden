// Synthetic decision model only. No network, database, storage or real publication.
export const spaces = ['Balcony', 'Greenhouse', 'Orchard'].map((name, i) => ({ id: `s${i + 1}`, kind: 'space', name }));
export const objects = Array.from({ length: 100 }, (_, i) => ({ id: `o${i + 1}`, kind: 'object', name: i < 2 ? 'Tomato' : `Subject ${String(i + 1).padStart(3, '0')}`, spaceId: i > 97 ? null : spaces[i % 3].id }));
export const destinations = [...spaces, ...objects];
export function label(d) { return d.kind === 'community' ? `${d.name} · Community` : d.kind === 'space' ? `${d.name} · Space journal` : `${d.name} · ${spaces.find(s => s.id === d.spaceId)?.name ?? 'Choose a space (unassigned)'}`; }
export function search(q) { return destinations.filter(d => label(d).toLowerCase().includes(q.toLowerCase())); }
export class Flow {
  constructor() { this.destination = null; this.text = ''; this.media = []; this.date = '2026-09-21'; this.status = 'Not published'; this.actions = 0; this.pending = null; this.receipts = []; this.intent = 'fixture-intent'; }
  open(d = null) { this.actions++; this.destination = d; return this; }
  select(d) { if (!d || (d.kind === 'object' && !d.spaceId)) throw new Error('Choose a valid space first.'); this.destination = d; this.actions++; }
  propose({name, spaceId}) { if (!name.trim() || !spaces.some(s => s.id === spaceId)) throw new Error('Name and a valid space are required.'); this.pending = { id: 'proposed-object', kind: 'object', name, spaceId }; this.select(this.pending); }
  publish({fail = false} = {}) {
    if (this.destination?.kind === 'object' && !this.destination.spaceId) throw new Error('Choose a valid space first.');
    if (!this.destination || !this.text.trim()) throw new Error('Choose a destination and write an observation.');
    if (fail) { this.status = 'Could not publish — input remains in this tab'; return null; }
    const previous = this.receipts.find(r => r.intent === this.intent); if (previous) return previous;
    const receipt = { intent: this.intent, destinationId: this.destination.id, kind: this.destination.kind, text: this.text, media: [...this.media], date: this.date, createdObject: this.pending?.id ?? null };
    this.receipts.push(receipt); this.pending = null; this.status = 'Fixture acknowledgment (not a real post)'; return receipt;
  }
}
export const scenarios = {
  'same-name': ['Find the Greenhouse tomato', null],
  space: ['Write a Balcony weather observation', spaces[0]],
  'first-object': ['Create the first object while writing', null],
  change: ['Change the target without losing input', objects[0]],
  community: ['Contribute to the same community', {id:'community-growing',kind:'community',name:'Growing together'}],
  failure: ['Recover from a failed publication', objects[1]],
};
