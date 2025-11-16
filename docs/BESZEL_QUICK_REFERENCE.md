# Beszel Integration - Quick Reference Guide

**Quick links for developers working with the Beszel monitoring integration.**

---

## 5-Minute Overview

### What It Does
The `/server-status` command retrieves real-time system metrics from Beszel and displays them in Discord with color-coded embeds.

### How To Use
```
/server-status system:production-web-01
```

### Result
Shows: CPU, Memory, Disk, Network, Uptime, Temperature

---

## Setup Checklist

### 1. Environment Variables
Add to `.env`:
```env
BESZEL_URL=https://your-beszel-hub.com
BESZEL_EMAIL=admin@example.com
BESZEL_PASSWORD=password123
```

### 2. Install Dependencies
```bash
npm install pocketbase@^0.21.3
```

### 3. Start Bot
```bash
npm run start
```

### 4. Verify
- Check logs for: `[BESZEL] Loaded X systems`
- In Discord, type: `/server-status`
- Autocomplete should show systems

---

## Code Examples

### Use PocketBase Client
```typescript
import BeszelUtils from '../RemoteDS/Beszel_Utilities.js';

// Get all systems
const systems = await BeszelUtils.beszel_getSystems(LCARS47.BESZEL_CLIENT);

// Get metrics for one system
const metrics = await BeszelUtils.beszel_getMetrics(
  LCARS47.BESZEL_CLIENT,
  systemId
);

console.log(`${metrics.name}: CPU ${metrics.cpu.toFixed(1)}%`);
```

### Use Cached Systems
```typescript
// Fast lookup without API call
const systems = LCARS47.BESZEL_SYSTEMS;

// Find by ID
const system = systems.find(s => s.id === systemId);

// Filter by status
const online = systems.filter(s => s.status === 'up');
```

### Handle Autocomplete
```typescript
async function autocomplete(LCARS47: LCARSClient, int: AutocompleteInteraction) {
  const systems = LCARS47.BESZEL_SYSTEMS || [];
  const focused = int.options.getFocused().toLowerCase();

  const choices = systems
    .filter(s => s.name.toLowerCase().includes(focused))
    .map(s => ({
      name: `${s.name} (${s.status})`,
      value: s.id
    }));

  await int.respond(choices.slice(0, 25));
}
```

---

## File Locations

| File | Purpose |
|------|---------|
| `Src/Commands/Active/server-status.ts` | Command implementation |
| `Src/Subsystems/RemoteDS/Beszel_Connect.ts` | PocketBase authentication |
| `Src/Subsystems/RemoteDS/Beszel_Utilities.ts` | Query & format utilities |
| `Src/Subsystems/Auxiliary/Interfaces/BeszelInterfaces.ts` | TypeScript types |
| `Src/Subsystems/Auxiliary/LCARSClient.ts` | Client interface (has BESZEL properties) |
| `Src/Events/ready.ts` | Initialization on startup |

---

## Available Functions

### Beszel Utilities
```typescript
// File: Src/Subsystems/RemoteDS/Beszel_Utilities.ts

// Fetch all systems
beszel_getSystems(client: PocketBase): Promise<BeszelSystemRecord[]>

// Fetch one system
beszel_getSystem(client: PocketBase, id: string): Promise<BeszelSystemRecord>

// Fetch latest stats for system
beszel_getSystemStats(client: PocketBase, id: string): Promise<BeszelSystemStats | null>

// Get formatted metrics
beszel_getMetrics(client: PocketBase, id: string): Promise<BeszelSystemMetrics>

// Parse raw data
beszel_parseMetrics(system: Record, stats?: Stats): BeszelSystemMetrics
```

### Beszel Connection
```typescript
// File: Src/Subsystems/RemoteDS/Beszel_Connect.ts

// Initialize and authenticate
beszel_connect(): Promise<PocketBase>
```

---

## Key Types

### BeszelSystemRecord
```typescript
{
  id: string;
  name: string;
  status: 'up' | 'down';
  host: string;
  port: number;
  info?: {
    h?: string;     // hostname
    c?: number;     // cpu cores
    u?: number;     // uptime seconds
    ct?: number;    // container count
  }
}
```

### BeszelSystemMetrics
```typescript
{
  id: string;
  name: string;
  status: string;
  cpu: number;                    // percentage
  memUsed: string;                // "8.4 GB"
  memTotal: string;               // "16 GB"
  memPercent: number;             // percentage
  diskUsed: string;               // "245 GB"
  diskTotal: string;              // "1 TB"
  diskPercent: number;            // percentage
  netDown: string;                // "1.5 MB/s"
  netUp: string;                  // "0.8 MB/s"
  uptime: string;                 // "45d 12h 34m"
  temperature?: number;           // celsius
  containers?: number;
}
```

---

## Common Tasks

### Display Metrics in Embed
```typescript
import { EmbedBuilder } from 'discord.js';

const metrics = await BeszelUtils.beszel_getMetrics(client, systemId);

const embed = new EmbedBuilder()
  .setTitle(`System: ${metrics.name}`)
  .setColor(metrics.status === 'up' ? 0x00FF00 : 0xFF0000)
  .addFields(
    { name: 'CPU', value: `${metrics.cpu.toFixed(1)}%`, inline: true },
    { name: 'Memory', value: `${metrics.memUsed} / ${metrics.memTotal}`, inline: true },
    { name: 'Disk', value: `${metrics.diskUsed} / ${metrics.diskTotal}`, inline: true }
  );

await interaction.reply({ embeds: [embed] });
```

### Filter Systems by Status
```typescript
const onlineSystems = LCARS47.BESZEL_SYSTEMS.filter(s => s.status === 'up');
const offlineSystems = LCARS47.BESZEL_SYSTEMS.filter(s => s.status === 'down');

console.log(`Online: ${onlineSystems.length}, Offline: ${offlineSystems.length}`);
```

### Get System by Name
```typescript
const system = LCARS47.BESZEL_SYSTEMS.find(s =>
  s.name.toLowerCase() === 'production-web-01'
);

if (system) {
  const metrics = await BeszelUtils.beszel_getMetrics(client, system.id);
  console.log(`CPU: ${metrics.cpu}%`);
}
```

---

## Troubleshooting

### Problem: Autocomplete Returns No Systems
**Check:**
- Is Beszel running? `curl https://your-beszel.com`
- Are credentials correct in `.env`?
- Did bot log "Loaded X systems" at startup?
- Workaround: Restart bot

### Problem: "System not found" Error
**Check:**
- Is system ID valid?
- Was system deleted in Beszel?
- Workaround: Get fresh list (restart bot)

### Problem: Metrics Show "N/A"
**Check:**
- Is Beszel agent running on that system?
- Is agent sending metrics?
- Check Beszel web UI for agent status
- Workaround: Wait for agent to connect

### Problem: "Unauthorized" Error
**Check:**
- BESZEL_EMAIL correct?
- BESZEL_PASSWORD correct?
- Admin account active in Beszel?
- Workaround: Update `.env` and restart

### Problem: Command Slow (>5 seconds)
**Check:**
- Network latency to Beszel?
- Beszel instance performance?
- Bot/Beszel on same network?
- Workaround: Check network connectivity

---

## Performance Tips

1. **Autocomplete** is cached - instant
2. **Metrics fetch** takes 1-3 seconds
3. **Reuse client** - don't create new PocketBase instances
4. **Check cache first** - before API calls when possible

---

## API Limits

- PocketBase doesn't enforce strict rate limits by default
- Recommended: <100 requests/minute per client
- Beszel design: Built for periodic polling, not real-time streaming

---

## Logging

Commands log to console with `[PREFIX]` format:

```
[BESZEL] Initializing PocketBase connection...
[BESZEL] Authenticated as admin@example.com
[BESZEL] Retrieved 5 systems
[SERVER-STATUS] Received server status request
[SERVER-STATUS] Successfully displayed metrics for production-web-01
[SERVER-STATUS] Error: System not found
```

Change log level in `SysUtils.ts` if needed.

---

## Configuration

### Bot Properties
```typescript
LCARS47.BESZEL_CLIENT      // PocketBase instance
LCARS47.BESZEL_SYSTEMS     // Array of BeszelSystemRecord[]
```

### Environment
```env
BESZEL_URL                 // https://hub.example.com
BESZEL_EMAIL               // admin@example.com
BESZEL_PASSWORD            // password123
```

---

## Testing

### Test Connection
```bash
# In bot logs
[BESZEL] Initializing PocketBase connection...
[BESZEL] Authenticated as admin@example.com
[BESZEL] Retrieved X systems
```

### Test Command
```
/server-status system:test-system
```

Expected response: Embed with metrics or error message

### Test Autocomplete
```
/server-status system:[type here]
```

Expected: Dropdown with matching systems

---

## Extending the Feature

### Add Caching Refresh
```typescript
setInterval(async () => {
  LCARS47.BESZEL_SYSTEMS = await BeszelUtils.beszel_getSystems(
    LCARS47.BESZEL_CLIENT
  );
  Utility.log('info', '[BESZEL] Refreshed systems cache');
}, 60000); // Every 60 seconds
```

### Add Status Notifications
```typescript
// Check system status every minute
setInterval(async () => {
  for (const system of LCARS47.BESZEL_SYSTEMS) {
    const metrics = await BeszelUtils.beszel_getMetrics(
      LCARS47.BESZEL_CLIENT,
      system.id
    );

    if (metrics.status !== system.status) {
      // System status changed - send notification
      await notifyStatusChange(system.name, metrics.status);
    }
  }
}, 60000);
```

### Add Metrics Thresholds
```typescript
if (metrics.cpu > 80) {
  // Log warning for high CPU
  Utility.log('warn', `[ALERT] ${metrics.name} CPU at ${metrics.cpu}%`);
}

if (parseFloat(metrics.memPercent) > 90) {
  // Log warning for high memory
  Utility.log('warn', `[ALERT] ${metrics.name} Memory at ${metrics.memPercent}%`);
}
```

---

## Related Documentation

- [Complete Feature Guide](./features/beszel-integration.md)
- [Technical Reference](./technical/beszel-pocketbase-integration.md)
- [Implementation Details](./implementation/server-status-command-actual.md)
- [Setup Guide](./implementation/server-status-command.md)
- [Integration Summary](./BESZEL_INTEGRATION_SUMMARY.md)

---

**Quick Reference Version:** 1.0
**Last Updated:** 2025-11-16
**For:** LCARS47 Developers
