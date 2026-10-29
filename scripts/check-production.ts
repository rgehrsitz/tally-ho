import { runtimeSettings } from '../src/lib/server/settings.ts';
const config = runtimeSettings(process.env, false);
if (config.mode !== 'supabase') throw new Error('Netlify requires Supabase mode.');
if (/\.supabase\.(co|com)$/.test(new URL(process.env.DATABASE_URL!).hostname) && !process.env.DATABASE_CA_CERT)
  console.warn('DATABASE_CA_CERT is not set. Supabase database certificates usually need Supabase\'s CA; see SUPABASE_SETUP.md.');
console.log('Production configuration shape verified. Live service access still needs rehearsal.');
