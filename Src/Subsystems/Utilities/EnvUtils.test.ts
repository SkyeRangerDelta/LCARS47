import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dotenv BEFORE importing EnvUtils to prevent loading real .env
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn()
  }
}));

describe('isFeatureEnabled', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Clear all env vars except PATH and system essentials
    for (const key of Object.keys(process.env)) {
      if (!['PATH', 'SYSTEMROOT', 'COMSPEC', 'WINDIR', 'HOME', 'USER'].includes(key)) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('returns false for non-existent feature group', async () => {
    // Set up minimal env to pass validation
    process.env.TOKEN = 'test-token';
    process.env.RDS = 'test-rds';
    process.env.PLDYNID = 'test-pldynid';
    process.env.LCARSID = 'test-lcarsid';
    process.env.OPENAIKEY = 'test-openai';
    process.env.MEDIALOG = 'test-medialog';
    process.env.ENGINEERING = 'test-engineering';
    process.env.SIMLAB = 'test-simlab';
    process.env.DEVLAB = 'test-devlab';

    const { isFeatureEnabled } = await import('./EnvUtils.js');
    expect(isFeatureEnabled('nonexistent')).toBe(false);
  });

  it('returns false when beszel feature group vars are missing', async () => {
    process.env.TOKEN = 'test-token';
    process.env.RDS = 'test-rds';
    process.env.PLDYNID = 'test-pldynid';
    process.env.LCARSID = 'test-lcarsid';
    process.env.OPENAIKEY = 'test-openai';
    process.env.MEDIALOG = 'test-medialog';
    process.env.ENGINEERING = 'test-engineering';
    process.env.SIMLAB = 'test-simlab';
    process.env.DEVLAB = 'test-devlab';
    // beszel vars intentionally NOT set

    const { isFeatureEnabled } = await import('./EnvUtils.js');
    expect(isFeatureEnabled('beszel')).toBe(false);
  });

  it('returns true when beszel feature group is fully configured', async () => {
    process.env.TOKEN = 'test-token';
    process.env.RDS = 'test-rds';
    process.env.PLDYNID = 'test-pldynid';
    process.env.LCARSID = 'test-lcarsid';
    process.env.OPENAIKEY = 'test-openai';
    process.env.MEDIALOG = 'test-medialog';
    process.env.ENGINEERING = 'test-engineering';
    process.env.SIMLAB = 'test-simlab';
    process.env.DEVLAB = 'test-devlab';
    process.env.BESZEL_URL = 'http://localhost:8090';
    process.env.BESZEL_EMAIL = 'admin@test.com';
    process.env.BESZEL_PASSWORD = 'password123';

    const { isFeatureEnabled } = await import('./EnvUtils.js');
    expect(isFeatureEnabled('beszel')).toBe(true);
  });

  it('returns false when jellyfin feature group is partially configured', async () => {
    process.env.TOKEN = 'test-token';
    process.env.RDS = 'test-rds';
    process.env.PLDYNID = 'test-pldynid';
    process.env.LCARSID = 'test-lcarsid';
    process.env.OPENAIKEY = 'test-openai';
    process.env.MEDIALOG = 'test-medialog';
    process.env.ENGINEERING = 'test-engineering';
    process.env.SIMLAB = 'test-simlab';
    process.env.DEVLAB = 'test-devlab';
    // Only JELLYFIN_HOST set, missing others
    process.env.JELLYFIN_HOST = 'http://jellyfin.local';
    // JELLYFIN_KEY, USER, PASS not set

    const { isFeatureEnabled } = await import('./EnvUtils.js');
    expect(isFeatureEnabled('jellyfin')).toBe(false);
  });

  it('returns true when jellyfin is fully configured (with defaults)', async () => {
    process.env.TOKEN = 'test-token';
    process.env.RDS = 'test-rds';
    process.env.PLDYNID = 'test-pldynid';
    process.env.LCARSID = 'test-lcarsid';
    process.env.OPENAIKEY = 'test-openai';
    process.env.MEDIALOG = 'test-medialog';
    process.env.ENGINEERING = 'test-engineering';
    process.env.SIMLAB = 'test-simlab';
    process.env.DEVLAB = 'test-devlab';
    process.env.JELLYFIN_HOST = 'http://jellyfin.local';
    // JELLYFIN_PORT has default, so not required
    process.env.JELLYFIN_KEY = 'api-key';
    process.env.JELLYFIN_USER = 'user';
    process.env.JELLYFIN_PASS = 'pass';

    const { isFeatureEnabled } = await import('./EnvUtils.js');
    expect(isFeatureEnabled('jellyfin')).toBe(true);
  });
});
