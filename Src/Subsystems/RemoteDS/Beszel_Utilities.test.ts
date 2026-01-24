import { describe, it, expect } from 'vitest';
import {
  formatGB,
  formatBytes,
  formatUptime,
  beszel_parseMetrics
} from './Beszel_Utilities.js';
import type {
  BeszelSystemRecord,
  BeszelSystemStats
} from '../Auxiliary/Interfaces/BeszelInterfaces.js';

describe('formatGB', () => {
  it('returns "0 GB" for 0', () => {
    expect(formatGB(0)).toBe('0 GB');
  });

  it('converts values less than 1 GB to MB', () => {
    expect(formatGB(0.5)).toBe('512.00 MB');
    expect(formatGB(0.25)).toBe('256.00 MB');
    expect(formatGB(0.001)).toBe('1.02 MB');
  });

  it('formats values 1 GB and above with 2 decimal places', () => {
    expect(formatGB(1)).toBe('1.00 GB');
    expect(formatGB(2.5)).toBe('2.50 GB');
    expect(formatGB(16.384)).toBe('16.38 GB');
    expect(formatGB(128)).toBe('128.00 GB');
  });
});

describe('formatBytes', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes (< 1024)', () => {
    expect(formatBytes(500)).toBe('500.00 B');
    expect(formatBytes(1023)).toBe('1023.00 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(102400)).toBe('100.00 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.00 MB');
    expect(formatBytes(1572864)).toBe('1.50 MB');
    expect(formatBytes(104857600)).toBe('100.00 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.00 GB');
    expect(formatBytes(1610612736)).toBe('1.50 GB');
  });

  it('formats terabytes', () => {
    expect(formatBytes(1099511627776)).toBe('1.00 TB');
    expect(formatBytes(1649267441664)).toBe('1.50 TB');
  });

  it('clamps to TB for very large values', () => {
    // 1 PB would be index 5, but we only have up to TB (index 4)
    const petabyte = 1125899906842624;
    expect(formatBytes(petabyte)).toBe('1024.00 TB');
  });
});

describe('formatUptime', () => {
  it('returns "< 1m" for 0 seconds', () => {
    expect(formatUptime(0)).toBe('< 1m');
  });

  it('returns "< 1m" for less than 60 seconds', () => {
    expect(formatUptime(30)).toBe('< 1m');
    expect(formatUptime(59)).toBe('< 1m');
  });

  it('formats minutes only', () => {
    expect(formatUptime(60)).toBe('1m');
    expect(formatUptime(120)).toBe('2m');
    expect(formatUptime(3540)).toBe('59m');
  });

  it('formats hours and minutes', () => {
    expect(formatUptime(3600)).toBe('1h');
    expect(formatUptime(3660)).toBe('1h 1m');
    expect(formatUptime(7200)).toBe('2h');
    expect(formatUptime(7320)).toBe('2h 2m');
  });

  it('formats days, hours, and minutes', () => {
    expect(formatUptime(86400)).toBe('1d');
    expect(formatUptime(90000)).toBe('1d 1h');
    expect(formatUptime(90060)).toBe('1d 1h 1m');
    expect(formatUptime(172800)).toBe('2d');
    expect(formatUptime(180000)).toBe('2d 2h');
  });

  it('handles large uptimes', () => {
    // 30 days, 12 hours, 45 minutes
    const seconds = (30 * 86400) + (12 * 3600) + (45 * 60);
    expect(formatUptime(seconds)).toBe('30d 12h 45m');
  });
});

describe('beszel_parseMetrics', () => {
  const baseSystem: BeszelSystemRecord = {
    id: 'sys123',
    collectionId: 'col123',
    collectionName: 'systems',
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-01T12:00:00Z',
    name: 'test-server',
    host: '192.168.1.100',
    port: 45876,
    status: 'up',
    users: ['user1']
  };

  it('parses basic system record without stats', () => {
    const metrics = beszel_parseMetrics(baseSystem);

    expect(metrics.id).toBe('sys123');
    expect(metrics.name).toBe('test-server');
    expect(metrics.status).toBe('up');
    expect(metrics.cpu).toBe(0);
    expect(metrics.memUsed).toBe('N/A');
    expect(metrics.memTotal).toBe('N/A');
    expect(metrics.diskUsed).toBe('N/A');
    expect(metrics.diskTotal).toBe('N/A');
    expect(metrics.netUp).toBe('N/A');
    expect(metrics.netDown).toBe('N/A');
    expect(metrics.uptime).toBe('N/A');
  });

  it('parses system with info data', () => {
    const systemWithInfo: BeszelSystemRecord = {
      ...baseSystem,
      info: {
        cpu: 25.5,
        mp: 60,
        dp: 45,
        u: 86400, // 1 day uptime
        ct: 5
      }
    };

    const metrics = beszel_parseMetrics(systemWithInfo);

    expect(metrics.cpu).toBe(25.5);
    expect(metrics.memPercent).toBe(60);
    expect(metrics.diskPercent).toBe(45);
    expect(metrics.uptime).toBe('1d');
    expect(metrics.containers).toBe(5);
  });

  it('prefers stats data over info data', () => {
    const systemWithInfo: BeszelSystemRecord = {
      ...baseSystem,
      info: {
        cpu: 25,
        mp: 50,
        dp: 40
      }
    };

    const stats: BeszelSystemStats = {
      cpu: 75,
      mp: 80,
      dp: 70,
      m: 16,
      mu: 12,
      d: 500,
      du: 350
    };

    const metrics = beszel_parseMetrics(systemWithInfo, stats);

    expect(metrics.cpu).toBe(75);
    expect(metrics.memPercent).toBe(80);
    expect(metrics.diskPercent).toBe(70);
    expect(metrics.memTotal).toBe('16.00 GB');
    expect(metrics.memUsed).toBe('12.00 GB');
    expect(metrics.diskTotal).toBe('500.00 GB');
    expect(metrics.diskUsed).toBe('350.00 GB');
  });

  it('calculates network totals from interface data', () => {
    const stats: BeszelSystemStats = {
      ni: {
        'eth0': [0, 0, 1073741824, 2147483648], // 1 GB sent, 2 GB received
        'eth1': [0, 0, 536870912, 1073741824]   // 0.5 GB sent, 1 GB received
      }
    };

    const metrics = beszel_parseMetrics(baseSystem, stats);

    expect(metrics.netUp).toBe('1.50 GB');
    expect(metrics.netDown).toBe('3.00 GB');
  });

  it('handles null stats gracefully', () => {
    const metrics = beszel_parseMetrics(baseSystem, null);

    expect(metrics.memUsed).toBe('N/A');
    expect(metrics.netUp).toBe('N/A');
  });

  it('formats memory in MB when less than 1 GB', () => {
    const stats: BeszelSystemStats = {
      m: 0.5,
      mu: 0.25
    };

    const metrics = beszel_parseMetrics(baseSystem, stats);

    expect(metrics.memTotal).toBe('512.00 MB');
    expect(metrics.memUsed).toBe('256.00 MB');
  });
});
