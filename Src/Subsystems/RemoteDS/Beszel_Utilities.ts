// Beszel Database Utilities

import type PocketBase from 'pocketbase';
import Utility from '../Utilities/SysUtils.js';
import type {
  BeszelSystemRecord,
  BeszelSystemMetrics,
  BeszelSystemStats
} from '../Auxiliary/Interfaces/BeszelInterfaces.js';

/**
 * Fetch all systems from Beszel
 * @param client - PocketBase instance
 * @param filter - Optional PocketBase filter string
 * @returns Promise<BeszelSystemRecord[]>
 */
export async function beszel_getSystems(
  client: PocketBase,
  filter?: string
): Promise<BeszelSystemRecord[]> {
  try {
    const systems = await client.collection('systems').getFullList<BeszelSystemRecord>({
      sort: 'name',
      filter: filter
    });

    Utility.log('info', `[BESZEL] Retrieved ${systems.length} systems`);
    return systems;
  } catch (error) {
    Utility.log('err', `[BESZEL] Failed to fetch systems: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Fetch single system by ID
 * @param client - PocketBase instance
 * @param systemId - System record ID
 * @returns Promise<BeszelSystemRecord>
 */
export async function beszel_getSystem(
  client: PocketBase,
  systemId: string
): Promise<BeszelSystemRecord> {
  try {
    const system = await client.collection('systems').getOne<BeszelSystemRecord>(systemId);

    Utility.log('info', `[BESZEL] Retrieved system: ${system.name}`);
    return system;
  } catch (error) {
    Utility.log('err', `[BESZEL] Failed to fetch system ${systemId}: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Fetch latest stats for a system
 * @param client - PocketBase instance
 * @param systemId - System record ID
 * @returns Promise<BeszelSystemStats | null>
 */
export async function beszel_getSystemStats(
  client: PocketBase,
  systemId: string
): Promise<BeszelSystemStats | null> {
  try {
    // Query stats collection for the most recent stat for this system
    const stats = await client.collection('system_stats').getList<{stats: BeszelSystemStats}>(1, 1, {
      filter: `system = "${systemId}"`,
      sort: '-created',
      fields: 'stats'
    });

    if (stats.items.length > 0 && stats.items[0].stats) {
      Utility.log('info', `[BESZEL] Retrieved stats for system ${systemId}`);
      return stats.items[0].stats;
    }

    Utility.log('warn', `[BESZEL] No stats found for system ${systemId}`);
    return null;
  } catch (error) {
    Utility.log('err', `[BESZEL] Failed to fetch stats for system ${systemId}: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Parse system record and stats into formatted metrics
 * @param system - Raw system record
 * @param stats - Live stats data (optional)
 * @returns BeszelSystemMetrics - Formatted metrics
 */
export function beszel_parseMetrics(
  system: BeszelSystemRecord,
  stats?: BeszelSystemStats | null
): BeszelSystemMetrics {
  const info = system.info;

  // Calculate network totals from interface cumulative data
  // Note: ns/nr are rates (bytes/sec), not cumulative totals
  let netUp = 'N/A';
  let netDown = 'N/A';

  if (stats?.ni) {
    // Sum up bytes sent from all interfaces (index 2 in the array)
    const totalBytesSent = Object.values(stats.ni).reduce((sum, iface) => sum + (iface[2] || 0), 0);
    if (totalBytesSent > 0) {
      netUp = formatBytes(totalBytesSent);
    }

    // Sum up bytes received from all interfaces (index 3 in the array)
    const totalBytesRecv = Object.values(stats.ni).reduce((sum, iface) => sum + (iface[3] || 0), 0);
    if (totalBytesRecv > 0) {
      netDown = formatBytes(totalBytesRecv);
    }
  }

  // Prefer stats data over info data (stats are more current)
  const metrics: BeszelSystemMetrics = {
    id: system.id,
    name: system.name,
    status: system.status,
    cpu: stats?.cpu || info?.cpu || 0,
    memUsed: stats?.mu ? formatGB(stats.mu) : 'N/A',
    memTotal: stats?.m ? formatGB(stats.m) : 'N/A',
    memPercent: stats?.mp || info?.mp || 0,
    diskUsed: stats?.du ? formatGB(stats.du) : 'N/A',
    diskTotal: stats?.d ? formatGB(stats.d) : 'N/A',
    diskPercent: stats?.dp || info?.dp || 0,
    netDown: netDown,
    netUp: netUp,
    uptime: info?.u ? formatUptime(info.u) : 'N/A',
    containers: info?.ct
  };

  return metrics;
}

/**
 * Get formatted metrics for a system
 * @param client - PocketBase instance
 * @param systemId - System record ID
 * @returns Promise<BeszelSystemMetrics>
 */
export async function beszel_getMetrics(
  client: PocketBase,
  systemId: string
): Promise<BeszelSystemMetrics> {
  const system = await beszel_getSystem(client, systemId);
  const stats = await beszel_getSystemStats(client, systemId);
  return beszel_parseMetrics(system, stats);
}

/**
 * Format GB to human-readable string
 * @param gb - Number in gigabytes
 * @returns Formatted string (e.g., "2.69 GB")
 */
export function formatGB(gb: number): string {
  if (gb === 0) return '0 GB';
  if (gb < 1) return `${(gb * 1024).toFixed(2)} MB`;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Format bytes to human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 GB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clampedIndex = Math.min(i, sizes.length - 1);

  return `${(bytes / Math.pow(k, clampedIndex)).toFixed(2)} ${sizes[clampedIndex]}`;
}

/**
 * Format uptime seconds to human-readable string
 * @param seconds - Uptime in seconds
 * @returns Formatted string (e.g., "5d 12h 30m")
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

export default {
  beszel_getSystems,
  beszel_getSystem,
  beszel_getSystemStats,
  beszel_getMetrics,
  beszel_parseMetrics
};
