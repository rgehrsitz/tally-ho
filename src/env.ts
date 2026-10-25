import { defineEnvVars } from '@sveltejs/kit/env';
export const variables = defineEnvVars({
  DEMO_HOST_PIN: { schema: (value: string | undefined) => value ?? '' }
});
