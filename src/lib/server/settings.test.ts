import { describe, expect, it } from 'vitest';
import { runtimeSettings } from './settings';
const valid = {
  APP_MODE: 'supabase', DATABASE_URL: 'postgresql://example:example@db.invalid/party?sslmode=verify-full',
  SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable', SUPABASE_SECRET_KEY: 'fixture-secret'
};
describe('production configuration boundaries', () => {
  it('keeps local demo explicit and never permits it in production', () => {
    expect(runtimeSettings({}, true).mode).toBe('demo');
    expect(() => runtimeSettings({ APP_MODE: 'demo' }, false)).toThrow('development');
    expect(() => runtimeSettings({}, false)).toThrow('Missing');
    expect(() => runtimeSettings({ APP_MODE: 'typo' }, true)).toThrow('APP_MODE');
  });
  it('requires every Supabase dependency without falling back to filesystem or PIN auth', () => {
    for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
      expect(() => runtimeSettings({ ...valid, [key]: '' }, true)).toThrow('Missing');
    }
    expect(runtimeSettings(valid, false)).toMatchObject({ mode: 'supabase', bucket: 'costume-photos' });
  });
  it('requires HTTPS and verified database TLS in production', () => {
    expect(() => runtimeSettings({ ...valid, SUPABASE_URL: 'http://remote.invalid' }, true)).toThrow('HTTPS');
    expect(() => runtimeSettings({ ...valid, SUPABASE_URL: 'http://127.0.0.1:54321' }, false)).toThrow('HTTPS');
    expect(runtimeSettings({ ...valid, SUPABASE_URL: 'http://127.0.0.1:54321' }, true).mode).toBe('supabase');
    expect(() => runtimeSettings({ ...valid, DATABASE_URL: 'postgresql://localhost/party' }, false)).toThrow('sslmode');
    expect(() => runtimeSettings({ ...valid, SUPABASE_URL: 'https://secret@project.supabase.co' }, false)).toThrow('origin');
  });
});
