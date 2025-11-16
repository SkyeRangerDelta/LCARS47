# Beszel PocketBase Integration - Technical Reference

**Repository:** [LCARS47](https://github.com/SkyeRangerDelta/LCARS47)
**Tech Stack:** TypeScript, Node.js >=18.20, PocketBase SDK
**Implementation:** v6.0.0-Experimental.2

---

## Table of Contents

1. [Overview](#overview)
2. [PocketBase Client Architecture](#pocketbase-client-architecture)
3. [Data Structures](#data-structures)
4. [Query Functions](#query-functions)
5. [System Metrics Processing](#system-metrics-processing)
6. [Caching Strategy](#caching-strategy)
7. [Error Handling](#error-handling)
8. [Integration Points](#integration-points)

---

## Overview

LCARS47 uses the PocketBase JavaScript SDK to connect to a Beszel monitoring hub. Unlike raw HTTPS requests, PocketBase provides:

- Built-in authentication with token management
- Automatic serialization/deserialization
- Collection-based API design
- Simple admin authentication

**Implementation Files:**
- `Src/Subsystems/RemoteDS/Beszel_Connect.ts` - Connection initialization
- `Src/Subsystems/RemoteDS/Beszel_Utilities.ts` - Database utilities
- `Src/Subsystems/Auxiliary/Interfaces/BeszelInterfaces.ts` - TypeScript types

---

## PocketBase Client Architecture

### Client Type

The Beszel client is a PocketBase instance:

```typescript
import PocketBase from 'pocketbase';

// LCARS47.BESZEL_CLIENT is of type PocketBase
type BESZEL_CLIENT = PocketBase;
```

### Authentication

PocketBase provides admin authentication through the SDK:

```typescript
import PocketBase from 'pocketbase';

async function beszel_connect(): Promise<PocketBase> {
  const baseUrl = process.env.BESZEL_URL;
  const email = process.env.BESZEL_EMAIL;
  const password = process.env.BESZEL_PASSWORD;

  const pb = new PocketBase(baseUrl);

  // Authenticate as admin
  await pb.admins.authWithPassword(email, password);

  // Token is automatically managed in pb.authStore
  console.log(`Authenticated as: ${pb.authStore.record?.email}`);
  console.log(`Token valid: ${pb.authStore.isValid}`);

  return pb;
}
```

### Authentication State

The client maintains authentication state through `authStore`:

```typescript
// Check if authenticated
if (LCARS47.BESZEL_CLIENT.authStore.isValid) {
  // Token is valid
}

// Get current token
const token = LCARS47.BESZEL_CLIENT.authStore.token;

// Get admin record
const admin = LCARS47.BESZEL_CLIENT.authStore.record;

// Check expiry
const isExpired = !LCARS47.BESZEL_CLIENT.authStore.isValid;
```

---

## Data Structures

### Collections

Beszel stores data in PocketBase collections:

#### `systems` Collection

Contains static system information and current metrics:

```typescript
interface BeszelSystemRecord {
  id: string;                    // Record ID
  collectionId: string;          // Collection reference
  collectionName: string;        // 'systems'
  created: string;               // ISO timestamp
  updated: string;               // ISO timestamp
  name: string;                  // System name
  host: string;                  // Hostname/IP
  port: number | string;         // Agent port
  status: string;                // 'up' or 'down'
  users: string[];               // User IDs with access
  info?: BeszelSystemInfo;       // System details object
}
```

**Example Record:**
```json
{
  "id": "rec_abc123xyz",
  "collectionId": "col_systems",
  "collectionName": "systems",
  "created": "2024-01-15 10:00:00.000Z",
  "updated": "2024-11-16 14:23:45.123Z",
  "name": "production-web-01",
  "host": "192.168.1.100",
  "port": 45876,
  "status": "up",
  "users": ["user_123", "user_456"],
  "info": {
    "h": "web01.prod",
    "k": "5.15.0-56-generic",
    "c": 4,
    "t": 8,
    "m": "Intel Core i7",
    "u": 3931454,
    "cpu": 23.5,
    "mp": 38.4,
    "dp": 23.9,
    "ct": 12
  }
}
```

#### `system_stats` Collection

Contains live metrics updated periodically:

```typescript
interface BeszelSystemStats {
  id: string;                    // Record ID
  system: string;                // System record ID (relation)
  created: string;               // ISO timestamp
  cpu?: number;                  // CPU %
  m?: number;                    // Memory total GB
  mu?: number;                   // Memory used GB
  mp?: number;                   // Memory %
  d?: number;                    // Disk total GB
  du?: number;                   // Disk used GB
  dp?: number;                   // Disk %
  ns?: number;                   // Network sent bytes
  nr?: number;                   // Network received bytes
  ni?: Record<string, number[]>; // Network interfaces
  la?: number[];                 // Load averages
}
```

**Network Interfaces Format (`ni`):**
- Key: Interface name (e.g., "eth0")
- Value: `[iface_info, index, bytes_sent, bytes_recv, packets_sent, packets_recv]`

---

## Query Functions

### beszel_getSystems()

Fetch all registered systems:

```typescript
async function beszel_getSystems(
  client: PocketBase,
  filter?: string
): Promise<BeszelSystemRecord[]> {
  const systems = await client.collection('systems').getFullList<BeszelSystemRecord>({
    sort: 'name',
    filter: filter  // Optional: "status='up'"
  });

  return systems;
}
```

**Usage:**
```typescript
// Get all systems
const allSystems = await beszel_getSystems(LCARS47.BESZEL_CLIENT);

// Get only online systems
const onlineSystems = await beszel_getSystems(
  LCARS47.BESZEL_CLIENT,
  "status='up'"
);

// Map to autocomplete choices
const choices = allSystems.map(s => ({
  name: `${s.name} (${s.status})`,
  value: s.id
}));
```

---

### beszel_getSystem()

Fetch single system by ID:

```typescript
async function beszel_getSystem(
  client: PocketBase,
  systemId: string
): Promise<BeszelSystemRecord> {
  return await client.collection('systems').getOne<BeszelSystemRecord>(systemId);
}
```

**Usage:**
```typescript
const system = await beszel_getSystem(LCARS47.BESZEL_CLIENT, systemId);
console.log(`System: ${system.name}`);
console.log(`Status: ${system.status}`);
```

---

### beszel_getSystemStats()

Fetch latest stats for a system:

```typescript
async function beszel_getSystemStats(
  client: PocketBase,
  systemId: string
): Promise<BeszelSystemStats | null> {
  const stats = await client.collection('system_stats').getList<{stats: BeszelSystemStats}>(
    1,  // Page 1
    1,  // Per page 1
    {
      filter: `system = "${systemId}"`,
      sort: '-created',  // Most recent first
      fields: 'stats'    // Only stats field
    }
  );

  if (stats.items.length > 0) {
    return stats.items[0].stats;
  }

  return null;
}
```

**Return Value:**
- Returns latest stat record or `null` if no stats found
- Stats are ordered by most recent first (`-created`)

---

### beszel_getMetrics()

Fetch and format metrics for display:

```typescript
async function beszel_getMetrics(
  client: PocketBase,
  systemId: string
): Promise<BeszelSystemMetrics> {
  const system = await beszel_getSystem(client, systemId);
  const stats = await beszel_getSystemStats(client, systemId);
  return beszel_parseMetrics(system, stats);
}
```

Returns formatted metrics ready for display in Discord embeds.

---

### beszel_parseMetrics()

Parse and format raw system data into displayable metrics:

```typescript
function beszel_parseMetrics(
  system: BeszelSystemRecord,
  stats?: BeszelSystemStats | null
): BeszelSystemMetrics {
  const info = system.info;

  // Calculate network totals from interface data
  let netUp = 'N/A';
  let netDown = 'N/A';

  if (stats?.ni) {
    // Sum bytes sent (index 2) from all interfaces
    const totalBytesSent = Object.values(stats.ni).reduce(
      (sum, iface) => sum + (iface[2] || 0),
      0
    );
    netUp = formatBytes(totalBytesSent);

    // Sum bytes received (index 3) from all interfaces
    const totalBytesRecv = Object.values(stats.ni).reduce(
      (sum, iface) => sum + (iface[3] || 0),
      0
    );
    netDown = formatBytes(totalBytesRecv);
  }

  return {
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
}
```

**Formatting Functions:**

```typescript
// Format bytes to human-readable (1.5 GB)
function formatBytes(bytes: number): string {
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Format GB value (2.69 GB)
function formatGB(gb: number): string {
  if (gb < 1) return `${(gb * 1024).toFixed(2)} MB`;
  return `${gb.toFixed(2)} GB`;
}

// Format seconds to human-readable (5d 12h 30m)
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : '< 1m';
}
```

---

## System Metrics Processing

### Data Flow

```
[Beszel Agent]
     |
     v
[Beszel Hub - PocketBase]
     |
     ├──> [systems collection] (static info)
     |    ├── name, host, port, status
     |    └── info {} (CPU cores, hostname, etc.)
     |
     └──> [system_stats collection] (live metrics)
          ├── cpu%, memory, disk, network
          └── updated every 10-30 seconds

           |
           v
[LCARS47 Bot]
     |
     ├──> beszel_connect() [reads.ts]
     |    └── Authenticates via admin credentials
     |
     ├──> beszel_getSystems() [caches in BESZEL_SYSTEMS]
     |    └── Used for autocomplete dropdown
     |
     └──> beszel_getMetrics() [command execution]
          └── Fetches latest stats + formats for display
```

### Metric Fields

**From `info` object (static):**
- Uptime (u)
- CPU cores (c), threads (t)
- Hostname (h)
- Kernel version (k)
- Container count (ct)

**From latest `system_stats` (live):**
- CPU usage %
- Memory used/total/percent
- Disk used/total/percent
- Network bytes (summed from interfaces)

**Preferred Data:**
- Stats are preferred over info when available (more recent)
- Falls back to info if stats missing

---

## Caching Strategy

### Systems List Caching

**Location:** `LCARS47.BESZEL_SYSTEMS`

```typescript
// In ready.ts
LCARS47.BESZEL_SYSTEMS = await BeszelUtils.beszel_getSystems(LCARS47.BESZEL_CLIENT);
```

**Purpose:**
- Fast autocomplete dropdown (no API call)
- Cached systems list initialized on bot startup
- Updated only on bot restart

**Usage in autocomplete:**
```typescript
async function autocomplete(LCARS47: LCARSClient, int: AutocompleteInteraction) {
  // Use cached list - no API call needed
  const systems = LCARS47.BESZEL_SYSTEMS || [];

  const filtered = systems.filter(s =>
    s.name.toLowerCase().includes(focusedValue.toLowerCase())
  );

  await int.respond(
    filtered.map(s => ({
      name: `${s.name} (${s.status})`,
      value: s.id
    }))
  );
}
```

**Trade-off:**
- Autocomplete is instant but slightly stale
- New systems added to Beszel visible after bot restart
- Status changes may be slightly delayed (updates on next search)

---

## Error Handling

### Common Errors

**Authentication Error:**
```
Error: Unauthorized
at PocketBase.request()
```

**Cause:** Invalid credentials or expired token

**Handling:**
```typescript
try {
  await pb.admins.authWithPassword(email, password);
} catch (error) {
  if ((error as Error).message.includes('Unauthorized')) {
    Utility.log('err', '[BESZEL] Invalid credentials');
    // Don't retry - credentials are bad
  }
  throw error;
}
```

---

**System Not Found:**
```
Error: Not found
at PocketBase.collection().getOne()
```

**Cause:** System ID no longer exists

**Handling:**
```typescript
try {
  const system = await beszel_getSystem(client, systemId);
} catch (error) {
  if ((error as Error).message.includes('Not found')) {
    Utility.log('warn', `[BESZEL] System ${systemId} not found`);
    // Suggest checking system list again
  }
  throw error;
}
```

---

**Network Error:**
```
Error: Unable to fetch
at fetch()
```

**Cause:** Network connectivity or Beszel instance down

**Handling:**
```typescript
try {
  const systems = await beszel_getSystems(client);
} catch (error) {
  if ((error as Error).message.includes('fetch')) {
    Utility.log('err', '[BESZEL] Network error - Beszel instance unreachable');
    // Return cached data or empty array
  }
  throw error;
}
```

---

## Integration Points

### Initialization (ready.ts)

```typescript
import Beszel from '../Subsystems/RemoteDS/Beszel_Connect.js';
import BeszelUtils from '../Subsystems/RemoteDS/Beszel_Utilities.js';

module.exports = {
  execute: async (LCARS47: LCARSClient) => {
    try {
      // Initialize PocketBase client
      LCARS47.BESZEL_CLIENT = await Beszel.beszel_connect();

      // Cache systems list for autocomplete
      LCARS47.BESZEL_SYSTEMS = await BeszelUtils.beszel_getSystems(
        LCARS47.BESZEL_CLIENT
      );

      Utility.log('proc',
        `[BESZEL] Loaded ${LCARS47.BESZEL_SYSTEMS.length} systems`
      );

    } catch (error) {
      Utility.log('err',
        `[BESZEL] Initialization failed: ${(error as Error).message}`
      );
      LCARS47.BESZEL_SYSTEMS = []; // Fallback to empty
    }
  }
};
```

---

### Command Execution (server-status.ts)

```typescript
import BeszelUtils from '../../Subsystems/RemoteDS/Beszel_Utilities.js';

async function execute(LCARS47: LCARSClient, int: ChatInputCommandInteraction) {
  const systemId = int.options.getString('system', true);

  // Fetch metrics
  const metrics = await BeszelUtils.beszel_getMetrics(
    LCARS47.BESZEL_CLIENT,
    systemId
  );

  // Format and display
  const embed = buildEmbed(metrics);
  await int.editReply({ embeds: [embed] });
}
```

---

### Autocomplete Handling (interactionCreate.ts)

```typescript
if (interaction.isAutocomplete()) {
  const command = LCARS47.CMD_INDEX.get(interaction.commandName);

  if (command && 'autocomplete' in command) {
    // Execute autocomplete function
    await command.autocomplete(LCARS47, interaction);
  }
}
```

---

## Dependencies

**NPM Package:**
```
pocketbase: ^0.21.3
```

**TypeScript Types:**
- PocketBase package includes built-in type definitions
- Custom interfaces in `BeszelInterfaces.ts`

---

## Related Documentation

- [Feature Documentation](../features/beszel-integration.md)
- [Implementation Guide](../implementation/server-status-command.md)
- [Command Architecture](../architecture/command-pattern.md)

---

**Document Version:** 2.0
**Last Updated:** 2025-11-16
**Tech Stack:** TypeScript, PocketBase SDK, Node.js
**Maintained By:** LCARS47 Development Team
