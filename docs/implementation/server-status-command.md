# Server Status Command - Implementation Guide

**Repository:** [LCARS47](https://github.com/SkyeRangerDelta/LCARS47)
**Related Issue:** [#66](https://github.com/SkyeRangerDelta/LCARS47/issues/66)
**Branch:** system-status-command
**Implementation Date:** 2025-11-15

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [File Structure Overview](#file-structure-overview)
4. [Step-by-Step Implementation](#step-by-step-implementation)
5. [Testing Procedures](#testing-procedures)
6. [Troubleshooting](#troubleshooting)
7. [Build and Deployment](#build-and-deployment)

---

## Prerequisites

### Required Infrastructure

1. **Beszel Instance Running**
   - Beszel hub deployed and accessible via HTTPS
   - At least one system registered with Beszel agent
   - Admin account created with email/password

2. **Development Environment**
   - Node.js >= 18.20.0
   - TypeScript installed (`npm install -g typescript`)
   - Git repository cloned: `C:\GitHub Repos\LCARS47`
   - Discord bot token configured

3. **Beszel Credentials Available**
   - Beszel instance URL (e.g., `https://beszel.example.com`)
   - Admin email address
   - Admin password

### Verify Beszel Accessibility

Test Beszel API manually before implementation:

```bash
# Test authentication
curl -X POST https://beszel.example.com/api/admins/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"admin@example.com","password":"yourpassword"}'

# Expected output: {"token":"...","admin":{...}}
```

---

## Environment Setup

### Step 1: Configure Environment Variables

Edit your `.env` file at `C:\GitHub Repos\LCARS47\.env`:

```env
# Existing variables...
TOKEN=your_discord_bot_token
RDS=your_mongodb_connection_string

# ADD THESE BESZEL VARIABLES
BESZEL_URL=https://beszel.example.com
BESZEL_EMAIL=admin@example.com
BESZEL_PASSWORD=your-secure-password
```

**Important:**
- Use HTTPS URLs for production (HTTP only for local testing)
- No trailing slash in `BESZEL_URL`
- Ensure `.env` is in `.gitignore` (already configured)

### Step 2: Verify Environment Loading

Check that environment variables load correctly:

```typescript
// Temporary test in any existing file
console.log('BESZEL_URL:', process.env.BESZEL_URL);
console.log('BESZEL_EMAIL:', process.env.BESZEL_EMAIL);
console.log('BESZEL_PASSWORD exists:', !!process.env.BESZEL_PASSWORD);
```

---

## File Structure Overview

Files to create/modify:

```
C:\GitHub Repos\LCARS47\
├── Src\
│   ├── Commands\
│   │   └── Active\
│   │       └── server-status.ts              # NEW - Command implementation
│   ├── Events\
│   │   └── ready.ts                          # MODIFY - Initialize Beszel client
│   └── Subsystems\
│       ├── Auxiliary\
│       │   ├── LCARSClient.ts                # MODIFY - Add BESZEL_CLIENT property
│       │   └── Interfaces\
│       │       └── BeszelInterfaces.ts       # NEW - TypeScript interfaces
│       └── Beszel\
│           └── Beszel_Connect.ts             # NEW - API connection logic
└── .env                                       # MODIFY - Add credentials
```

---

## Step-by-Step Implementation

### Step 1: Create BeszelInterfaces.ts

**File:** `C:\GitHub Repos\LCARS47\Src\Subsystems\Auxiliary\Interfaces\BeszelInterfaces.ts`

```typescript
// -- BESZEL INTERFACES --

/**
 * Beszel client configuration with authentication token
 */
export interface BeszelClient {
  baseUrl: string;
  authToken: string;
  tokenExpiry?: number;
}

/**
 * Response from Beszel authentication endpoint
 */
export interface BeszelAuthResponse {
  token: string;
  admin: {
    id: string;
    email: string;
    created?: string;
    updated?: string;
    avatar?: number;
  };
}

/**
 * Basic system record from Beszel
 */
export interface BeszelSystemRecord {
  id: string;
  name: string;
  status: string;
  host: string;
  port: number;
  created: string;
  updated: string;
}

/**
 * System record with detailed metrics
 */
export interface BeszelSystemDetails extends BeszelSystemRecord {
  info: {
    cpu: number;
    mem: {
      used: number;
      total: number;
      percent: number;
    };
    disk: {
      used: number;
      total: number;
      percent: number;
    };
    net: {
      down: number;
      up: number;
    };
    uptime: number;
    temp?: number;
  };
}

/**
 * Paginated response wrapper from PocketBase
 */
export interface BeszelListResponse<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

/**
 * Error response from Beszel API
 */
export interface BeszelErrorResponse {
  code: number;
  message: string;
  data: Record<string, unknown>;
}
```

---

### Step 2: Create Beszel_Connect.ts

**Directory:** Create `C:\GitHub Repos\LCARS47\Src\Subsystems\Beszel\`

**File:** `C:\GitHub Repos\LCARS47\Src\Subsystems\Beszel\Beszel_Connect.ts`

```typescript
// -- BESZEL CONNECTION --

// Imports
import https from 'https';
import Utility from '../Utilities/SysUtils.js';
import type {
  BeszelClient,
  BeszelAuthResponse,
  BeszelListResponse,
  BeszelSystemRecord,
  BeszelSystemDetails
} from '../Auxiliary/Interfaces/BeszelInterfaces';

/**
 * Authenticates with Beszel API and returns client configuration
 * @returns BeszelClient with authentication token
 */
async function beszel_connect(): Promise<BeszelClient> {
  Utility.log('info', '[Beszel] Initiating authentication...');

  const baseUrl = process.env.BESZEL_URL;
  const email = process.env.BESZEL_EMAIL;
  const password = process.env.BESZEL_PASSWORD;

  // Validate environment variables
  if (!baseUrl || !email || !password) {
    throw new Error('[Beszel] Missing required environment variables (BESZEL_URL, BESZEL_EMAIL, BESZEL_PASSWORD)');
  }

  // Prepare authentication request body
  const authBody = JSON.stringify({
    identity: email,
    password: password
  });

  const url = new URL('/api/admins/auth-with-password', baseUrl);

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(authBody)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString();

        if (res.statusCode !== 200) {
          Utility.log('err', `[Beszel] Authentication failed with status ${res.statusCode}`);
          Utility.log('err', `[Beszel] Response: ${responseBody}`);
          return reject(new Error(`Beszel authentication failed: HTTP ${res.statusCode}`));
        }

        try {
          const authResponse: BeszelAuthResponse = JSON.parse(responseBody) as BeszelAuthResponse;
          Utility.log('info', `[Beszel] Authentication successful for ${authResponse.admin.email}`);

          const client: BeszelClient = {
            baseUrl: baseUrl,
            authToken: authResponse.token,
            tokenExpiry: Date.now() + (14 * 24 * 60 * 60 * 1000) // 2 weeks
          };

          resolve(client);
        } catch (parseError) {
          Utility.log('err', `[Beszel] Failed to parse auth response: ${parseError}`);
          reject(parseError);
        }
      });

      res.on('error', (err) => {
        Utility.log('err', `[Beszel] Response error: ${err.message}`);
        reject(err);
      });
    });

    req.on('error', (err) => {
      Utility.log('err', `[Beszel] Request error: ${err.message}`);
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      Utility.log('err', '[Beszel] Authentication request timeout');
      reject(new Error('Beszel authentication timeout'));
    });

    req.write(authBody);
    req.end();
  });
}

/**
 * Fetches list of all systems from Beszel
 * @param client BeszelClient with authentication token
 * @returns List of system records
 */
async function getSystems(client: BeszelClient): Promise<BeszelListResponse<BeszelSystemRecord>> {
  Utility.log('info', '[Beszel] Fetching systems list...');

  return makeRequest<BeszelListResponse<BeszelSystemRecord>>(
    client,
    '/api/collections/systems/records?perPage=100'
  );
}

/**
 * Fetches detailed metrics for a specific system
 * @param client BeszelClient with authentication token
 * @param systemId System record ID
 * @returns System details with metrics
 */
async function getSystemMetrics(client: BeszelClient, systemId: string): Promise<BeszelSystemDetails> {
  Utility.log('info', `[Beszel] Fetching metrics for system ${systemId}...`);

  return makeRequest<BeszelSystemDetails>(
    client,
    `/api/collections/systems/records/${systemId}`
  );
}

/**
 * Generic HTTP request helper for Beszel API
 * @param client BeszelClient with authentication token
 * @param path API endpoint path
 * @param retryAuth Whether to retry with re-authentication on 401
 * @returns Parsed JSON response
 */
async function makeRequest<T>(
  client: BeszelClient,
  path: string,
  retryAuth: boolean = true
): Promise<T> {
  const url = new URL(path, client.baseUrl);

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      'Authorization': client.authToken
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', async () => {
        const responseBody = Buffer.concat(chunks).toString();

        // Handle 401 - Token expired, re-authenticate
        if (res.statusCode === 401 && retryAuth) {
          Utility.log('warn', '[Beszel] Token expired (401), re-authenticating...');

          try {
            const newClient = await beszel_connect();

            // Update global client (assuming LCARS47 is accessible)
            // Note: This requires the client to be passed by reference or updated globally
            client.authToken = newClient.authToken;
            client.tokenExpiry = newClient.tokenExpiry;

            // Retry request with new token (prevent infinite loop)
            const result = await makeRequest<T>(client, path, false);
            return resolve(result);
          } catch (authError) {
            Utility.log('err', `[Beszel] Re-authentication failed: ${authError}`);
            return reject(authError);
          }
        }

        // Handle non-200 responses
        if (res.statusCode !== 200) {
          Utility.log('err', `[Beszel] Request failed with status ${res.statusCode}`);
          Utility.log('err', `[Beszel] Response: ${responseBody}`);
          return reject(new Error(`Beszel API error: HTTP ${res.statusCode}`));
        }

        // Parse and return successful response
        try {
          const data: T = JSON.parse(responseBody) as T;
          resolve(data);
        } catch (parseError) {
          Utility.log('err', `[Beszel] Failed to parse response: ${parseError}`);
          reject(parseError);
        }
      });

      res.on('error', (err) => {
        Utility.log('err', `[Beszel] Response error: ${err.message}`);
        reject(err);
      });
    });

    req.on('error', (err) => {
      Utility.log('err', `[Beszel] Request error: ${err.message}`);
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      Utility.log('err', '[Beszel] Request timeout');
      reject(new Error('Beszel request timeout'));
    });

    req.end();
  });
}

// Exports
export default {
  beszel_connect,
  getSystems,
  getSystemMetrics
};
```

---

### Step 3: Extend LCARSClient Interface

**File:** `C:\GitHub Repos\LCARS47\Src\Subsystems\Auxiliary\LCARSClient.ts`

**Modification:**

```typescript
// -- LCARS Client --

// Imports
import {
  type Client,
  type Collection,
  type Guild,
  type GuildMember
} from 'discord.js';
import { type LCARSMediaPlayer } from './Interfaces/MediaInterfaces.js';
import { type MongoClient } from 'mongodb';
import { type StatusInterface } from './Interfaces/StatusInterface.js';
import { type BeszelClient } from './Interfaces/BeszelInterfaces.js';  // ADD THIS
import type { Command } from './Interfaces/CommandInterface';

// Exports
export interface LCARSClient extends Client {
  CMD_INDEX: Collection<
    string,
    Command
  >
  PLDYN: Guild
  MEMBER: GuildMember
  MEDIA_QUEUE: Map<string, LCARSMediaPlayer>
  RDS_CONNECTION: MongoClient
  BESZEL_CLIENT: BeszelClient  // ADD THIS
  CLIENT_STATS: StatusInterface
}
```

---

### Step 4: Initialize Beszel in ready.ts

**File:** `C:\GitHub Repos\LCARS47\Src\Events\ready.ts`

**Modification (around line 68):**

```typescript
// -- READY EVENT --

// Imports
import Utility from '../Subsystems/Utilities/SysUtils.js';
import { type LCARSClient } from '../Subsystems/Auxiliary/LCARSClient.js';
import RDS from '../Subsystems/RemoteDS/RDS_Utilities.js';
import Beszel from '../Subsystems/Beszel/Beszel_Connect.js';  // ADD THIS
import { type StatusInterface } from '../Subsystems/Auxiliary/Interfaces/StatusInterface.js';

import { ActivityType, type TextChannel } from 'discord.js';
import * as fs from 'node:fs';

// ... existing code ...

module.exports = {
  name: 'clientReady',
  once: true,
  execute: async ( LCARS47: LCARSClient, args?: string[] ) => {
    // ... existing validation and setup code ...

    if ( process.argv.includes( '--heartbeat' ) ) {
      Utility.log( 'proc', 'Heartbeat done.' );
      return process.exit( 0 );
    }

    // Initialize RDS connection
    LCARS47.RDS_CONNECTION = await RDS.rds_connect();

    // Initialize Beszel connection - ADD THIS BLOCK
    try {
      LCARS47.BESZEL_CLIENT = await Beszel.beszel_connect();
      Utility.log('info', '[CLIENT] Beszel integration initialized');
    } catch (error) {
      Utility.log('err', `[CLIENT] Beszel initialization failed: ${error}`);
      Utility.log('warn', '[CLIENT] Continuing without Beszel integration');
      // Set a placeholder to prevent undefined errors
      LCARS47.BESZEL_CLIENT = {
        baseUrl: '',
        authToken: '',
        tokenExpiry: 0
      };
    }

    // ... rest of existing code ...
  }
};
```

---

### Step 5: Create server-status.ts Command

**File:** `C:\GitHub Repos\LCARS47\Src\Commands\Active\server-status.ts`

```typescript
// -- SERVER STATUS COMMAND --

// Imports
import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import { type Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import Beszel from '../../Subsystems/Beszel/Beszel_Connect.js';

import type {
  BeszelSystemRecord,
  BeszelSystemDetails
} from '../../Subsystems/Auxiliary/Interfaces/BeszelInterfaces';

// Command definition
const data = new SlashCommandBuilder()
  .setName('server-status')
  .setDescription('Retrieves real-time system metrics from monitored servers.')
  .addStringOption(option =>
    option
      .setName('system')
      .setDescription('The server system to query')
      .setRequired(true)
      .setAutocomplete(true)
  );

/**
 * Execute server status command
 */
async function execute(LCARS47: LCARSClient, int: ChatInputCommandInteraction): Promise<void> {
  Utility.log('info', '[ServerStatus] Received server status query');
  await int.deferReply();

  try {
    // Get selected system ID from interaction
    const systemId = int.options.getString('system', true);

    Utility.log('info', `[ServerStatus] Fetching metrics for system: ${systemId}`);

    // Fetch system details with metrics
    const systemDetails: BeszelSystemDetails = await Beszel.getSystemMetrics(
      LCARS47.BESZEL_CLIENT,
      systemId
    );

    // Build Discord embed
    const embed = buildStatusEmbed(systemDetails);

    // Send response
    await int.editReply({ embeds: [embed] });
    Utility.log('info', '[ServerStatus] Successfully sent system status');

  } catch (error) {
    Utility.log('err', `[ServerStatus] Error: ${error}`);

    await int.editReply({
      content: 'Failed to retrieve server status. The system may be unavailable or there was an API error.'
    });
  }
}

/**
 * Handle autocomplete for system selection
 */
async function autocomplete(LCARS47: LCARSClient, int: any): Promise<void> {
  try {
    // Fetch available systems
    const systemsResponse = await Beszel.getSystems(LCARS47.BESZEL_CLIENT);
    const systems: BeszelSystemRecord[] = systemsResponse.items;

    // Build autocomplete choices
    const choices = systems.map(system => ({
      name: `${system.name} (${system.status})`,
      value: system.id
    }));

    // Respond with choices
    await int.respond(choices);

  } catch (error) {
    Utility.log('err', `[ServerStatus] Autocomplete error: ${error}`);
    // Return empty array on error
    await int.respond([]);
  }
}

/**
 * Build Discord embed with system metrics
 */
function buildStatusEmbed(system: BeszelSystemDetails): EmbedBuilder {
  // Determine embed color based on status
  const color = system.status === 'online' ? 0x00FF00 : 0xFF0000;

  // Format metrics
  const cpuUsage = `${system.info.cpu.toFixed(1)}%`;
  const memoryUsage = `${formatBytes(system.info.mem.used)} / ${formatBytes(system.info.mem.total)} (${system.info.mem.percent.toFixed(1)}%)`;
  const diskUsage = `${formatBytes(system.info.disk.used)} / ${formatBytes(system.info.disk.total)} (${system.info.disk.percent.toFixed(1)}%)`;
  const networkUsage = `↓ ${formatBytes(system.info.net.down)}/s | ↑ ${formatBytes(system.info.net.up)}/s`;
  const uptime = formatUptime(system.info.uptime);

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle(`System Status: ${system.name}`)
    .setColor(color)
    .setTimestamp()
    .addFields(
      { name: 'Status', value: system.status, inline: true },
      { name: 'CPU Usage', value: cpuUsage, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: 'Memory', value: memoryUsage, inline: false },
      { name: 'Disk Usage', value: diskUsage, inline: false },
      { name: 'Network', value: networkUsage, inline: false },
      { name: 'Uptime', value: uptime, inline: true }
    )
    .setFooter({ text: `Host: ${system.host}:${system.port}` });

  // Add temperature if available
  if (system.info.temp !== undefined && system.info.temp > 0) {
    embed.addFields({ name: 'Temperature', value: `${system.info.temp}°C`, inline: true });
  }

  return embed;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format uptime seconds to human-readable string
 */
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

/**
 * Help text for command
 */
function help(): string {
  return 'Retrieves real-time system metrics from monitored servers via Beszel.';
}

// Exports
export default {
  name: 'server-status',
  data,
  execute,
  autocomplete,
  help
} satisfies Command;
```

**Note:** The command includes an `autocomplete` function. You'll need to ensure your command handler supports autocomplete interactions.

---

### Step 6: Update Command Handler for Autocomplete

**File:** `C:\GitHub Repos\LCARS47\Src\Subsystems\OPs\OPs_CmdHandler.ts` (or wherever interactions are handled)

**Modification:** Add autocomplete handling

```typescript
// In your interaction handler
if (interaction.isAutocomplete()) {
  const command = LCARS47.CMD_INDEX.get(interaction.commandName);

  if (!command) return;

  // Check if command has autocomplete function
  if ('autocomplete' in command && typeof command.autocomplete === 'function') {
    try {
      await command.autocomplete(LCARS47, interaction);
    } catch (error) {
      Utility.log('err', `[Autocomplete] Error: ${error}`);
    }
  }

  return;
}
```

---

## Testing Procedures

### Test 1: Authentication Test

**Objective:** Verify Beszel connection on bot startup

**Steps:**
1. Ensure `.env` has correct Beszel credentials
2. Start bot: `npm run start`
3. Check logs for:
   ```
   [Beszel] Initiating authentication...
   [Beszel] Authentication successful for admin@example.com
   [CLIENT] Beszel integration initialized
   ```

**Expected Result:** No authentication errors, bot starts successfully

**Troubleshooting:**
- "Missing required environment variables" → Check `.env` file
- "Authentication failed: HTTP 401" → Verify email/password
- "Request timeout" → Check Beszel URL and network connectivity

---

### Test 2: Autocomplete Test

**Objective:** Verify system list retrieval and autocomplete

**Steps:**
1. In Discord, type `/server-status`
2. Click on the `system` parameter
3. Observe autocomplete dropdown

**Expected Result:**
- List of systems appears (e.g., "production-web-01 (online)")
- Systems show current status
- No errors in bot logs

**Troubleshooting:**
- No options appear → Check Beszel has systems registered
- "Autocomplete error" in logs → Verify API token is valid
- Empty list → Confirm systems exist in Beszel instance

---

### Test 3: Metrics Display Test

**Objective:** Verify system metrics are fetched and displayed

**Steps:**
1. Run `/server-status system:production-web-01`
2. Wait for response (may take 1-3 seconds)
3. Examine embed

**Expected Result:**
- Green embed (if system online) or red (if offline)
- All metrics populated: CPU, Memory, Disk, Network, Uptime
- Temperature shown if available
- Footer shows host:port
- Timestamp at bottom

**Troubleshooting:**
- "Failed to retrieve server status" → Check system ID is valid
- Missing metrics → Verify Beszel agent is sending data
- Embed color wrong → Check system status in Beszel

---

### Test 4: Error Scenarios

**Objective:** Verify graceful error handling

**Test 4a: Invalid System ID**
1. Manually edit autocomplete value (Discord dev tools) to invalid ID
2. Run command
3. Expect: "Failed to retrieve server status" error message

**Test 4b: Beszel Instance Down**
1. Stop Beszel instance temporarily
2. Run command
3. Expect: Timeout error or connection refused

**Test 4c: Token Expiry (Manual)**
1. Modify `LCARS47.BESZEL_CLIENT.authToken` to invalid value
2. Run command
3. Expect: Re-authentication, then successful response

---

### Test 5: Multiple Systems

**Objective:** Test with multiple registered systems

**Steps:**
1. Register 3+ systems in Beszel
2. Run `/server-status` for each system
3. Verify correct metrics for each

**Expected Result:**
- Each system shows unique metrics
- No cross-contamination of data
- Autocomplete shows all systems

---

## Troubleshooting

### Issue: TypeScript Compilation Errors

**Symptom:**
```
error TS2307: Cannot find module './Interfaces/BeszelInterfaces.js'
```

**Solution:**
- Ensure all import paths use `.js` extension (TypeScript convention)
- Check file paths match exactly (case-sensitive)
- Run `npm run build` to verify compilation

---

### Issue: "BESZEL_CLIENT is undefined"

**Symptom:**
```
TypeError: Cannot read properties of undefined (reading 'authToken')
```

**Solution:**
- Verify `ready.ts` initializes `LCARS47.BESZEL_CLIENT`
- Check bot has fully started before running command
- Review logs for Beszel initialization errors

---

### Issue: Autocomplete Not Working

**Symptom:** Autocomplete doesn't trigger or shows no options

**Solution:**
- Ensure command handler has autocomplete support (Step 6)
- Check `autocomplete` function is exported in command
- Verify Discord command registration completed (wait 1 hour after deploy)

---

### Issue: Network/SSL Errors

**Symptom:**
```
Error: unable to verify the first certificate
```

**Solution:**
- Use valid SSL certificate on Beszel instance
- For testing only: Add `rejectUnauthorized: false` to HTTPS options (NOT for production)
- Check firewall isn't blocking HTTPS traffic

---

### Issue: Metrics Not Updating

**Symptom:** Metrics show same values repeatedly

**Solution:**
- No caching implemented, so check Beszel agent is running
- Verify agent is sending updates to hub
- Check Beszel hub database for recent updates
- Restart Beszel agent on monitored system

---

### Issue: Permission Errors in Discord

**Symptom:** Command doesn't appear or "You do not have permission"

**Solution:**
- Verify bot has `applications.commands` scope
- Check Discord server permissions allow slash commands
- Re-invite bot with updated scopes if needed

---

## Build and Deployment

### Development Build

```bash
# Navigate to project root
cd "C:\GitHub Repos\LCARS47"

# Install dependencies (if needed)
npm install

# Build TypeScript
npm run build

# Expected output: No errors, compiled files in Dist/
```

### Start Bot (Development)

```bash
# Run in development mode
npm run start

# Or with nodemon for auto-restart
npm run dev
```

### Production Deployment

```bash
# 1. Build production bundle
npm run build

# 2. Set NODE_ENV to production
export NODE_ENV=production  # Linux/Mac
set NODE_ENV=production     # Windows

# 3. Start with PM2 (recommended)
pm2 start Dist/index.js --name LCARS47

# 4. Monitor logs
pm2 logs LCARS47

# 5. Setup auto-restart on crash
pm2 save
pm2 startup
```

### Verification Checklist

After deployment:

- [ ] Bot shows online in Discord
- [ ] `/server-status` appears in command list
- [ ] Autocomplete shows systems
- [ ] At least one system returns metrics successfully
- [ ] Logs show no authentication errors
- [ ] Environment variables loaded correctly

### Rollback Plan

If issues occur:

1. **Switch to previous Git branch:**
   ```bash
   git checkout Experimental
   git pull origin Experimental
   ```

2. **Rebuild and restart:**
   ```bash
   npm run build
   pm2 restart LCARS47
   ```

3. **Remove Beszel environment variables** from `.env` (temporary)

---

## Performance Considerations

### Expected Response Times

- Autocomplete: 200-500ms
- System metrics fetch: 500-2000ms
- Total command execution: 1-3 seconds

### Optimization Tips

1. **Cache autocomplete results:**
   - Store system list for 60 seconds
   - Reduces API calls during heavy usage

2. **Implement request pooling:**
   - Limit concurrent Beszel requests
   - Prevent overloading Beszel instance

3. **Add timeout handling:**
   - Set reasonable timeouts (5-10 seconds)
   - Fail gracefully on slow responses

---

## Next Steps

After successful implementation:

1. **Add error notifications:**
   - Log failed requests to dedicated Discord channel
   - Alert on repeated failures

2. **Implement caching:**
   - Cache system list for autocomplete
   - Consider short-term metric caching (30-60s)

3. **Add permission controls:**
   - Restrict command to specific roles
   - Use Discord's command permissions API

4. **Create monitoring dashboard:**
   - Track command usage
   - Monitor Beszel API response times

5. **Expand functionality:**
   - Add historical metrics (if Beszel supports)
   - Implement alert thresholds
   - Create comparison commands (multiple systems)

---

## Related Documentation

- [Feature Documentation](../features/beszel-integration.md)
- [Technical API Guide](../technical/beszel-api-integration.md)
- [Command Architecture](../architecture/command-pattern.md)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-15
**Implementation Status:** Complete
**Maintained By:** LCARS47 Development Team
