import { defineEnvVars } from '@sveltejs/kit/env';
export const variables = defineEnvVars({
  DATABASE_URL: { schema: (value: string | undefined) => value ?? '' },
  EVENT_ID: { schema: (value: string | undefined) => value ?? 'halloween-demo' },
  DEMO_HOST_PIN: { schema: (value: string | undefined) => value ?? '' }
});
