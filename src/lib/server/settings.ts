export interface RuntimeValues {
  APP_MODE?: string; DATABASE_URL?: string; DATABASE_CA_CERT?: string; EVENT_ID?: string;
  SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string; SUPABASE_SECRET_KEY?: string; SUPABASE_PHOTO_BUCKET?: string;
}
export type Settings = { mode: 'demo'; eventId: string } | {
  mode: 'supabase'; eventId: string; url: string; publishableKey: string; secretKey: string; bucket: string;
};
export function runtimeSettings(env: RuntimeValues, development: boolean): Settings {
  const mode = env.APP_MODE || (development ? 'demo' : 'supabase');
  const eventId = env.EVENT_ID || 'halloween-demo';
  if (mode === 'demo') {
    if (!development) throw new Error('Demo mode is available only on the development server.');
    return { mode, eventId };
  }
  if (mode !== 'supabase') throw new Error('APP_MODE must be demo or supabase.');
  for (const name of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'] as const) {
    if (!env[name]) throw new Error(`Missing server configuration: ${name}.`);
  }
  const url = new URL(env.SUPABASE_URL!);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('SUPABASE_URL must be a project origin.');
  if (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Supabase requires HTTPS outside local development.');
  const database = new URL(env.DATABASE_URL!);
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
  if (!development && database.searchParams.get('sslmode') !== 'verify-full') throw new Error('Production DATABASE_URL must use sslmode=verify-full.');
  if (env.DATABASE_CA_CERT && !certificate(env.DATABASE_CA_CERT).includes('-----BEGIN CERTIFICATE-----')) throw new Error('DATABASE_CA_CERT must be a PEM certificate.');
  const bucket = env.SUPABASE_PHOTO_BUCKET || 'costume-photos';
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket)) throw new Error('Use a lowercase bucket name with letters, numbers and hyphens.');
  return { mode, eventId, url: url.origin, publishableKey: env.SUPABASE_PUBLISHABLE_KEY!, secretKey: env.SUPABASE_SECRET_KEY!, bucket };
}

/** Env values often carry PEM newlines as literal \n. */
function certificate(value: string): string { return value.replace(/\\n/g, '\n').trim(); }

/** Supabase's database certificate chains to Supabase's own root CA, which Node
 * doesn't trust by default, so verify-full needs that CA supplied explicitly.
 * node-postgres lets ssl* URL parameters override the ssl option, so they are
 * removed and the same verification (chain + hostname) is configured directly. */
export function databaseConfig(connectionString: string, ca?: string): { connectionString: string; ssl?: { ca: string; rejectUnauthorized: true } } {
  if (!ca) return { connectionString };
  const url = new URL(connectionString);
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { ca: certificate(ca), rejectUnauthorized: true } };
}
