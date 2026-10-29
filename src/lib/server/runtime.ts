import { dev } from '$app/env';
import { APP_MODE, DATABASE_URL, DATABASE_CA_CERT, EVENT_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_PHOTO_BUCKET } from '$app/env/private';
import { runtimeSettings } from './settings';
export function settings() {
  return runtimeSettings({ APP_MODE, DATABASE_URL, DATABASE_CA_CERT, EVENT_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_PHOTO_BUCKET }, dev);
}
