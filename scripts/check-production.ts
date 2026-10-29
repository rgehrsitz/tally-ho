import { runtimeSettings } from '../src/lib/server/settings.ts';
const config = runtimeSettings(process.env, false);
if (config.mode !== 'supabase') throw new Error('Netlify requires Supabase mode.');
console.log('Production configuration shape verified. Live service access still needs rehearsal.');
