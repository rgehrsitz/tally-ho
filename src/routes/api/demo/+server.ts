import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publicView, RuleError } from '#lib/domain.ts';
import { isHost, login, logout, voterId } from '#lib/server/auth.ts';
import { readParty, actOnParty } from '#lib/server/store.ts';
import { createHash, randomBytes } from 'node:crypto';
import { settings } from '#lib/server/runtime.ts';
import { uploadPhoto, removePhoto } from '#lib/server/photos.ts';
const headers = { 'cache-control': 'private, no-store' };
export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const host = url.searchParams.get('host') === '1' && await isHost(cookies);
    return json({ ...publicView(await readParty(), voterId(cookies), host), authMode: settings().mode, canReset: settings().mode === 'demo' }, { headers });
  } catch { return json({ error: 'Event services are unavailable. Ask the host to check setup.' }, { status: 503, headers }); }
};
export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Request origin is not allowed.' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required.' }, { status: 415, headers });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 3_000_000) return json({ error: 'Please use a photo smaller than 2 MB.' }, { status: 413, headers });
  let uploaded: string | undefined;
  let registrationReceipt: string | undefined;
  try {
    const input = JSON.parse(raw) as Record<string, unknown>;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RuleError('Invalid request.');
    const config = settings();
    let host = await isHost(cookies);
    if (input.action === 'login') { await login(cookies, input, getClientAddress()); host = await isHost(cookies); }
    else if (input.action === 'logout') { await logout(cookies); host = false; }
    else if (input.action === 'reset') {
      if (!host) return json({ error: 'Host sign-in required.' }, { status: 401, headers });
      if (config.mode !== 'demo') return json({ error: 'Demo reset is disabled in Supabase mode.' }, { status: 403, headers });
      const previous = await readParty();
      await actOnParty({ action: 'reset' }, voterId(cookies), true);
      // Delete only known old files, never the directory: a registration may
      // upload a new photo after the reset transaction commits.
      for (const entry of previous.entries) {
        const name = entry.photo?.match(/^\/api\/photos\/([a-f0-9]{32}\.(?:png|jpeg|webp))$/)?.[1];
        if (name) await removePhoto(name);
      }
    } else {
      if (input.action !== 'register' && input.action !== 'vote' && !host) return json({ error: 'Host sign-in required.' }, { status: 401, headers });
      if (input.action === 'register') {
        delete input.photo;
        // Only the server may supply hashes to the domain. The raw capability
        // goes to this signup's caller once; it is never a voter identifier.
        delete input.receiptHash;
        if (input.type === 'individual') {
          registrationReceipt = randomBytes(32).toString('hex');
          input.receiptHash = createHash('sha256').update(registrationReceipt).digest('hex');
        }
        if (Array.isArray(input.partners)) input.partners = input.partners.map(partner => {
          if (!partner || typeof partner !== 'object' || Array.isArray(partner)) return partner;
          const { receiptHash: _untrustedHash, receipt, ...safe } = partner;
          if (receipt !== undefined) {
            if (typeof receipt !== 'string' || !/^[a-f0-9]{64}$/.test(receipt)) throw new RuleError('Invalid signup receipt.');
            if (safe.entry !== undefined) throw new RuleError('Choose one signup receipt or existing entry.');
            return { ...safe, receiptHash: createHash('sha256').update(receipt).digest('hex') };
          }
          return safe;
        });
        if (input.photoData) {
          uploaded = await uploadPhoto(input.photoData);
          input.photo = `/api/photos/${uploaded}`;
        }
      }
      await actOnParty(input, voterId(cookies), host);
      uploaded = undefined; // Committed photos must survive a later response/read failure.
    }
    return json({ ...publicView(await readParty(), voterId(cookies), url.searchParams.get('host') === '1' && host), authMode: config.mode, canReset: config.mode === 'demo', ...(registrationReceipt ? { registrationReceipt } : {}) }, { headers });
  } catch (error) {
    if (uploaded && error instanceof RuleError) { try { await removePhoto(uploaded); } catch { console.error('An uncommitted photo needs storage cleanup.'); } }
    else if (uploaded) console.error('A photo needs reconciliation after an uncertain database result; it was not deleted.');
    return json({ error: error instanceof RuleError ? error.message : 'Unable to save while event services are unavailable. Please try again.' }, { status: error instanceof RuleError ? 400 : 503, headers });
  }
};
