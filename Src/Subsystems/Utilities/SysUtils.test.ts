import { describe, it, expect } from 'vitest';
import SysUtils from './SysUtils.js';

describe('stardate', () => {
  it('formats date as MMDDYY.T', () => {
    // January 15, 2025 at noon UTC-5
    const testDate = new Date('2025-01-15T17:00:00.000Z'); // 12:00 UTC-5
    const result = SysUtils.stardate(testDate);

    // Format should be MMDDYY.T where T is tenth of day
    expect(result).toMatch(/^\d{5,6}\.\d$/);
    expect(result).toBe('11525.5'); // Jan 15 2025, halfway through day
  });

  it('returns 0 tenth at start of day', () => {
    // Midnight UTC-5 = 05:00 UTC
    const testDate = new Date('2025-06-20T05:00:00.000Z');
    const result = SysUtils.stardate(testDate);

    expect(result).toBe('62025.0');
  });

  it('returns 9 tenth at end of day', () => {
    // 23:59:59 UTC-5 = 04:59:59 UTC next day
    const testDate = new Date('2025-03-11T04:59:59.000Z');
    const result = SysUtils.stardate(testDate);

    expect(result).toBe('31025.9');
  });
});

describe('shipboardTime', () => {
  it('returns time in HH:MM:SS format', () => {
    const result = SysUtils.shipboardTime();

    // Should match HH:MM:SS format
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('formatProcess_mem', () => {
  it('converts bytes to MB with 2 decimal places', () => {
    // 1 MB = 1024 * 1024 bytes = 1048576 bytes
    expect(SysUtils.formatProcess_mem(1048576)).toBe(1);
    expect(SysUtils.formatProcess_mem(2097152)).toBe(2);
  });

  it('handles fractional MB values', () => {
    // 1.5 MB = 1572864 bytes
    expect(SysUtils.formatProcess_mem(1572864)).toBe(1.5);
  });

  it('rounds to 2 decimal places', () => {
    // Test rounding behavior
    const result = SysUtils.formatProcess_mem(1234567);
    expect(result).toBe(1.18);
  });

  it('returns 0 for 0 bytes', () => {
    expect(SysUtils.formatProcess_mem(0)).toBe(0);
  });
});

describe('flexTime', () => {
  it('returns formatted date string', () => {
    const testDate = new Date('2025-07-04T12:00:00.000Z');
    const result = SysUtils.flexTime(testDate);

    // Should contain date components
    expect(result).toContain('Jul');
    expect(result).toContain('4');
    expect(result).toContain('2025');
  });

  it('returns current time when no date provided', () => {
    const result = SysUtils.flexTime();

    // Should return a non-empty string
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
