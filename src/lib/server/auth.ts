import { RuleError } from '../domain';
import { dev } from '$app/env';
import { DEMO_HOST_PIN } from '$app/env/private';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import { settings } from './runtime';
import { hasHostAccess } from './store';
import type { Settings } from './settings';
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
function demoHost(cookies: Cookies): boolean {
  const token = cookies.get('tally_host');
  return !!token && (sessions.get(token) ?? 0) > Date.now();
}
function demoLogin(cookies: Cookies, pin: unknown, address: string): void {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  for (const [key, expiry] of sessions) if (expiry < now) sessions.delete(key);
  const attempt = attempts.get(address) ?? { count: 0, until: now + 60_000 };
  if (++attempt.count > 8) throw new RuleError('Too many attempts. Please try again in a minute.');
  attempts.set(address, attempt);
  const expected = DEMO_HOST_PIN || (dev ? '2468' : '');
  if (!expected) throw new RuleError('Set DEMO_HOST_PIN before running the production demo build.');
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (typeof pin !== 'string' || !timingSafeEqual(hash(pin), hash(expected))) throw new RuleError('Incorrect host PIN.');
  const token = randomBytes(32).toString('hex');
  sessions.set(token, now + 12 * 60 * 60 * 1000);
  cookies.set('tally_host', token, { path: '/', httpOnly: true, sameSite: 'strict', secure: !dev, maxAge: 12 * 60 * 60 });
  attempts.delete(address);
}
function demoLogout(cookies: Cookies): void {
  const token = cookies.get('tally_host');
  if (token) sessions.delete(token);
  cookies.delete('tally_host', { path: '/' });
}

function supabaseSession(config: Extract<Settings, { mode: 'supabase' }>, cookies: Cookies) {
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: { name: 'tally_supabase', path: '/', httpOnly: true, secure: !dev, sameSite: 'lax' },
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: updates => { for (const { name, value, options } of updates) cookies.set(name, value, { ...options, path: '/', httpOnly: true, secure: !dev, sameSite: 'lax' }); }
    }
  });
}
function clearSupabaseCookies(cookies: Cookies) {
  for (const { name } of cookies.getAll()) if (name === 'tally_supabase' || name.startsWith('tally_supabase.')) cookies.delete(name, { path: '/' });
}
export async function isHost(cookies: Cookies): Promise<boolean> {
  const config = settings();
  if (config.mode === 'demo') return demoHost(cookies);
  if (!cookies.getAll().some(cookie => cookie.name === 'tally_supabase' || cookie.name.startsWith('tally_supabase.'))) return false;
  const { data, error } = await supabaseSession(config, cookies).auth.getUser();
  // getUser verifies with Auth; cookie session data and user_metadata are never authorization.
  return !error && !!data.user && await hasHostAccess(data.user.id);
}
export async function login(cookies: Cookies, input: Record<string, unknown>, address: string): Promise<void> {
  const config = settings();
  if (config.mode === 'demo') { demoLogin(cookies, input.pin, address); return; }
  if (typeof input.email !== 'string' || typeof input.password !== 'string' || !input.email.trim() || input.email.length > 254 || !input.password || input.password.length > 1024) throw new RuleError('Enter your host email and password.');
  const client = supabaseSession(config, cookies);
  const { data, error } = await client.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
  if (error || !data.user || !await hasHostAccess(data.user.id)) {
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* Clear local credentials even if Auth is unavailable. */ } finally { clearSupabaseCookies(cookies); }
    throw new RuleError('Sign-in failed or this account has no host access to this event.');
  }
}
export async function logout(cookies: Cookies): Promise<void> {
  const config = settings();
  if (config.mode === 'demo') { demoLogout(cookies); return; }
  try { await supabaseSession(config, cookies).auth.signOut({ scope: 'local' }); }
  finally { clearSupabaseCookies(cookies); }
}
