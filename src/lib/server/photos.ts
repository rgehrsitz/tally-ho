import { RuleError } from '../domain';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { settings } from './runtime';

export const photoName = /^[a-f0-9]{32}\.(png|jpeg|webp)$/;
function storage() {
  const config = settings();
  if (config.mode !== 'supabase') return null;
  // This private server client is never used for Auth or sent to the browser.
  const client = createClient(config.url, config.secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { api: client.storage, name: config.bucket, bucket: client.storage.from(config.bucket), prefix: `${encodeURIComponent(config.eventId)}/` };
}
export async function uploadPhoto(value: unknown): Promise<string> {
  if (typeof value !== 'string') throw new RuleError('Invalid photo.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new RuleError('Please choose a JPEG, PNG, or WebP photo.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 2_000_000) throw new RuleError('Please use a photo smaller than 2 MB.');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new RuleError('The photo does not match its file type.');
  const name = `${randomBytes(16).toString('hex')}.${match[1]}`;
  const cloud = storage();
  if (cloud) {
    const metadata = await cloud.api.getBucket(cloud.name);
    if (metadata.error || !metadata.data || metadata.data.public) throw new RuleError('Photo storage must use a private bucket. Ask your host to check storage setup.');
    const { error } = await cloud.bucket.upload(cloud.prefix + name, bytes, { contentType: `image/${match[1]}`, upsert: false });
    if (error) throw new RuleError('Photo storage is unavailable. Try again, or register without a photo.');
  } else {
    const directory = resolve(process.cwd(), '.data/photos');
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, name), bytes, { mode: 0o600 });
  }
  return name;
}
export async function downloadPhoto(name: string): Promise<Uint8Array> {
  if (!photoName.test(name)) throw new RuleError('Invalid photo name.');
  const cloud = storage();
  if (!cloud) return readFileSync(resolve(process.cwd(), '.data/photos', name));
  const { data, error } = await cloud.bucket.download(cloud.prefix + name);
  if (error || !data) throw new RuleError('Photo unavailable.');
  return new Uint8Array(await data.arrayBuffer());
}
export async function removePhoto(name: string): Promise<void> {
  if (!photoName.test(name)) throw new RuleError('Invalid photo name.');
  const cloud = storage();
  if (!cloud) { rmSync(resolve(process.cwd(), '.data/photos', name), { force: true }); return; }
  const { error } = await cloud.bucket.remove([cloud.prefix + name]);
  if (error) throw new RuleError('Photo cleanup failed.');
}
