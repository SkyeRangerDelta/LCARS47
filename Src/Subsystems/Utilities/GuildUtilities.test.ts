import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dotenv to prevent loading real .env
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn()
  }
}));

describe('GuildUtilities', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();

    // Clear env vars that might interfere
    for (const key of Object.keys(process.env)) {
      if (!['PATH', 'SYSTEMROOT', 'COMSPEC', 'WINDIR', 'HOME', 'USER'].includes(key)) {
        delete process.env[key];
      }
    }

    // Set up required env vars for EnvUtils validation
    process.env.TOKEN = 'test-token';
    process.env.RDS = 'test-rds';
    process.env.PLDYNID = 'test-guild';
    process.env.LCARSID = 'test-bot';
    process.env.OPENAIKEY = 'test-openai';
    process.env.MEDIALOG = '111111111111111111';
    process.env.ENGINEERING = '222222222222222222';
    process.env.SIMLAB = '333333333333333333';
    process.env.DEVLAB = '444444444444444444';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isSpecChannel', () => {
    it('returns channel info for SIMLAB channel', async () => {
      const GuildUtilities = (await import('./GuildUtilities.js')).default;

      const result = GuildUtilities.isSpecChannel('333333333333333333');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('SIMLAB');
      expect(result?.id).toBe('333333333333333333');
    });

    it('returns channel info for ENGINEERING channel', async () => {
      const GuildUtilities = (await import('./GuildUtilities.js')).default;

      const result = GuildUtilities.isSpecChannel('222222222222222222');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('ENGINEERING');
    });

    it('returns channel info for MEDIALOG channel', async () => {
      const GuildUtilities = (await import('./GuildUtilities.js')).default;

      const result = GuildUtilities.isSpecChannel('111111111111111111');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('MEDIALOG');
    });

    it('returns channel info for DEVLAB channel', async () => {
      const GuildUtilities = (await import('./GuildUtilities.js')).default;

      const result = GuildUtilities.isSpecChannel('444444444444444444');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('DEVLAB');
    });

    it('returns null for non-special channel', async () => {
      const GuildUtilities = (await import('./GuildUtilities.js')).default;

      const result = GuildUtilities.isSpecChannel('999999999999999999');

      expect(result).toBeNull();
    });

    it('returns null for empty string', async () => {
      const GuildUtilities = (await import('./GuildUtilities.js')).default;

      const result = GuildUtilities.isSpecChannel('');

      expect(result).toBeNull();
    });
  });
});
