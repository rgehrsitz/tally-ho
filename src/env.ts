import { defineEnvVars } from '@sveltejs/kit/env';
export const variables = defineEnvVars({
  APP_MODE: { schema: (value: string | undefined) => value ?? '' },
  SUPABASE_URL: { schema: (value: string | undefined) => value ?? '' },
  SUPABASE_PUBLISHABLE_KEY: { schema: (value: string | undefined) => value ?? '' },
  SUPABASE_SECRET_KEY: { schema: (value: string | undefined) => value ?? '' },
  SUPABASE_PHOTO_BUCKET: { schema: (value: string | undefined) => value ?? 'costume-photos' },
  DATABASE_URL: { schema: (value: string | undefined) => value ?? '' },
  DATABASE_CA_CERT: { schema: (value: string | undefined) => value ?? '' },
  EVENT_ID: { schema: (value: string | undefined) => value ?? 'halloween-demo' },
  DEMO_HOST_PIN: { schema: (value: string | undefined) => value ?? '' }
});
