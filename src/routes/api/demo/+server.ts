import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publicView } from '#lib/domain.ts';
import { isHost, login, logout, voterId } from '#lib/server/auth.ts';
import { dataDir, readParty, actOnParty } from '#lib/server/store.ts';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const headers = { 'cache-control': 'private, no-store' };
export const GET: RequestHandler = async ({ cookies, url }) => {
  const host = url.searchParams.get('host') === '1' && isHost(cookies);
  return json(publicView(await readParty(), voterId(cookies), host), { headers });
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
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request.');
    if (input.action === 'login') login(cookies, input.pin, getClientAddress());
    else if (input.action === 'logout') logout(cookies);
    else if (input.action === 'reset') {
      if (!isHost(cookies)) return json({ error: 'Host sign-in required.' }, { status: 401, headers });
      const previous = await readParty();
      await actOnParty({ action: 'reset' }, voterId(cookies), true);
      // Delete only known old files, never the directory: a registration may
      // upload a new photo after the reset transaction commits.
      for (const entry of previous.entries) {
        const name = entry.photo?.match(/^\/api\/photos\/([a-f0-9]{32}\.(?:png|jpeg|webp))$/)?.[1];
        if (name) rmSync(resolve(dataDir, 'photos', name), { force: true });
      }
    } else {
      const host = isHost(cookies);
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
            if (typeof receipt !== 'string' || !/^[a-f0-9]{64}$/.test(receipt)) throw new Error('Invalid signup receipt.');
            if (safe.entry !== undefined) throw new Error('Choose one signup receipt or existing entry.');
            return { ...safe, receiptHash: createHash('sha256').update(receipt).digest('hex') };
          }
          return safe;
        });
        if (input.photoData) {
          if (typeof input.photoData !== 'string') throw new Error('Invalid photo.');
          const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(input.photoData);
          if (!match) throw new Error('Please choose a JPEG, PNG, or WebP photo.');
          const bytes = Buffer.from(match[2], 'base64');
          if (bytes.length > 2_000_000) throw new Error('Please use a photo smaller than 2 MB.');
          const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
          if (!valid) throw new Error('The photo does not match its file type.');
          const name = `${randomBytes(16).toString('hex')}.${match[1]}`;
          mkdirSync(resolve(dataDir, 'photos'), { recursive: true });
          uploaded = resolve(dataDir, 'photos', name);
          writeFileSync(uploaded, bytes, { mode: 0o600 });
          input.photo = `/api/photos/${name}`;
        }
      }
      await actOnParty(input, voterId(cookies), host);
      uploaded = undefined; // Committed photos must survive a later response/read failure.
    }
    return json({ ...publicView(await readParty(), voterId(cookies), url.searchParams.get('host') === '1' && isHost(cookies)), ...(registrationReceipt ? { registrationReceipt } : {}) }, { headers });
  } catch (error) {
    if (uploaded) rmSync(uploaded, { force: true });
    return json({ error: error instanceof Error ? error.message : 'Something went wrong.' }, { status: 400, headers });
  }
};
