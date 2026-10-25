import { dev } from '$app/env';
import { DEMO_HOST_PIN } from '$app/env/private';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
const sessions = new Map<string, number>();
const attempts = new Map<string, { count: number; until: number }>();
export function voterId(cookies: Cookies): string {
  let token = cookies.get('tally_voter');
  if (!token || !/^[a-f0-9]{48}$/.test(token)) {
    token = randomBytes(24).toString('hex');
    cookies.set('tally_voter', token, { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: 60 * 60 * 24 * 30 });
  }
  return token;
}
export function isHost(cookies: Cookies): boolean {
  const token = cookies.get('tally_host');
  return !!token && (sessions.get(token) ?? 0) > Date.now();
}
export function login(cookies: Cookies, pin: unknown, address: string): void {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  for (const [key, expiry] of sessions) if (expiry < now) sessions.delete(key);
  const attempt = attempts.get(address) ?? { count: 0, until: now + 60_000 };
  if (++attempt.count > 8) throw new Error('Too many attempts. Please try again in a minute.');
  attempts.set(address, attempt);
  const expected = DEMO_HOST_PIN || (dev ? '2468' : '');
  if (!expected) throw new Error('Set DEMO_HOST_PIN before running the production demo build.');
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (typeof pin !== 'string' || !timingSafeEqual(hash(pin), hash(expected))) throw new Error('Incorrect host PIN.');
  const token = randomBytes(32).toString('hex');
  sessions.set(token, now + 12 * 60 * 60 * 1000);
  cookies.set('tally_host', token, { path: '/', httpOnly: true, sameSite: 'strict', secure: !dev, maxAge: 12 * 60 * 60 });
  attempts.delete(address);
}
export function logout(cookies: Cookies): void {
  const token = cookies.get('tally_host');
  if (token) sessions.delete(token);
  cookies.delete('tally_host', { path: '/' });
}
