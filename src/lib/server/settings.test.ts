import { describe, expect, it } from 'vitest';
import { databaseConfig, runtimeSettings } from './settings';
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
describe('database TLS', () => {
  const pem = '-----BEGIN CERTIFICATE-----\nMIIfixture\n-----END CERTIFICATE-----';
  it('passes a supplied CA directly and strips URL ssl options that would override it', () => {
    const config = databaseConfig('postgresql://u:p@db.example.test:6543/postgres?sslmode=verify-full&application_name=tally', pem.replace(/\n/g, '\\n'));
    expect(config.ssl).toEqual({ ca: pem, rejectUnauthorized: true });
    expect(config.connectionString).not.toContain('sslmode');
    expect(config.connectionString).toContain('application_name=tally');
  });
  it('leaves the URL alone without a CA and rejects a non-PEM value', () => {
    expect(databaseConfig('postgresql://localhost/party')).toEqual({ connectionString: 'postgresql://localhost/party' });
    expect(() => runtimeSettings({ ...valid, DATABASE_CA_CERT: 'not a cert' }, false)).toThrow('PEM');
    expect(runtimeSettings({ ...valid, DATABASE_CA_CERT: pem }, false).mode).toBe('supabase');
  });
});
