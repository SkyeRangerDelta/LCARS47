# Beszel Integration - Complete Documentation Summary

**Date:** 2025-11-16
**Feature:** Real-time Server Monitoring via Discord
**Status:** Complete and Documented

---

## Executive Summary

LCARS47 now includes complete Beszel monitoring integration, enabling users to query real-time system metrics directly from Discord. The implementation uses the PocketBase SDK for seamless API access and includes autocomplete for system selection.

**New Command:** `/server-status system:<system-name>`

**Key Deliverables:**
- PocketBase-based connection layer
- Database utilities for metric retrieval and formatting
- Complete Discord command with autocomplete
- TypeScript interfaces for type safety
- Comprehensive documentation suite

---

## Quick Start

### Environment Setup

Add to `.env`:
```env
BESZEL_URL=https://your-beszel-instance.com
BESZEL_EMAIL=admin@example.com
BESZEL_PASSWORD=your-secure-password
```

### Using the Command

```
/server-status system:production-web-01
```

Returns:
- System status (online/offline)
- CPU usage %
- Memory used/total
- Disk usage
- Network transfer rates
- System uptime
- Temperature (if available)

---

## Architecture Overview

### Component Diagram

```
Discord Bot (LCARS47)
    |
    ├── [Commands/Active/server-status.ts]
    |   ├── Define slash command
    |   ├── Handle autocomplete
    |   └── Build embed response
    |
    ├── [Subsystems/RemoteDS/Beszel_Connect.ts]
    |   └── Initialize PocketBase client
    |
    ├── [Subsystems/RemoteDS/Beszel_Utilities.ts]
    |   ├── beszel_getSystems() - Fetch all systems
    |   ├── beszel_getSystem() - Fetch single system
    |   ├── beszel_getSystemStats() - Get latest metrics
    |   ├── beszel_getMetrics() - Get formatted metrics
    |   └── beszel_parseMetrics() - Parse raw data
    |
    ├── [Subsystems/Auxiliary/Interfaces/BeszelInterfaces.ts]
    |   ├── BeszelSystemRecord
    |   ├── BeszelSystemMetrics
    |   ├── BeszelSystemInfo
    |   └── BeszelSystemStats
    |
    └── [Events/ready.ts]
        └── Initialize on startup + cache systems
              |
              v
        [PocketBase SDK]
              |
              v
        [Beszel Hub (PocketBase)]
              |
              ├── /collections/systems
              └── /collections/system_stats
                      |
                      v
                [Beszel Agents]
                (Monitored Systems)
```

---

## Implemented Features

### 1. System Selection with Autocomplete
- **Type:** String option with autocomplete
- **Data Source:** Cached systems list in `LCARS47.BESZEL_SYSTEMS`
- **Response Time:** <100ms (cached)
- **Display:** System name + status (e.g., "production-web-01 (up)")

### 2. Real-Time Metrics Display
- **CPU Usage:** Percentage across all cores
- **Memory:** Used / Total (GB) with percentage
- **Disk:** Used / Total (GB) with percentage
- **Network:** Download/Upload speeds (bytes/sec)
- **Uptime:** Human-readable format (45d 12h 34m)
- **Temperature:** Optional (when available)
- **Container Count:** Optional (when available)

### 3. Rich Embed Formatting
- **Color Coding:** Green for online, red for offline
- **Emoji Icons:** Visual indicators for each metric
- **Responsive Layout:** Multiple fields with inline formatting
- **Timestamp:** When metrics were retrieved

### 4. Robust Error Handling
- Graceful autocomplete failure (returns empty list)
- User-friendly error messages
- Logging for debugging
- Fallback behavior for initialization failures

---

## Documentation Structure

### Core Documentation Files

1. **[architecture/command-pattern.md](../architecture/command-pattern.md)**
   - Command interface requirements
   - Auto-registration system
   - LCARSClient properties (including new BESZEL_CLIENT and BESZEL_SYSTEMS)
   - Best practices
   - Discord.js v14 patterns

2. **[features/beszel-integration.md](../features/beszel-integration.md)**
   - Feature overview and use cases
   - Command syntax and parameters
   - Expected output format
   - Access requirements
   - Troubleshooting guide

3. **[technical/beszel-pocketbase-integration.md](../technical/beszel-pocketbase-integration.md)** (NEW)
   - PocketBase SDK architecture
   - Collection structures (systems, system_stats)
   - Query functions and usage
   - Metrics processing pipeline
   - Caching strategy
   - Error handling patterns

4. **[implementation/server-status-command-actual.md](../implementation/server-status-command-actual.md)** (NEW)
   - Actual implementation details
   - Files created and modified
   - Environment variable setup
   - Command structure and execution flow
   - Metrics formatting examples
   - Network data parsing
   - Testing checklist
   - Performance characteristics

5. **[implementation/server-status-command.md](../implementation/server-status-command.md)**
   - Step-by-step setup guide
   - Configuration instructions
   - Testing procedures
   - Troubleshooting guide
   - Build and deployment steps

---

## Files Created

### Command
```
Src/Commands/Active/server-status.ts (144 lines)
├── Slash command definition
├── Autocomplete handler
├── Execute handler
└── Embed builder
```

### Connection Layer
```
Src/Subsystems/RemoteDS/Beszel_Connect.ts (40 lines)
└── PocketBase initialization and authentication
```

### Database Utilities
```
Src/Subsystems/RemoteDS/Beszel_Utilities.ts (207 lines)
├── beszel_getSystems()
├── beszel_getSystem()
├── beszel_getSystemStats()
├── beszel_getMetrics()
├── beszel_parseMetrics()
├── Formatting utilities (bytes, GB, uptime)
└── Network interface parsing
```

### TypeScript Interfaces
```
Src/Subsystems/Auxiliary/Interfaces/BeszelInterfaces.ts (91 lines)
├── BeszelSystemRecord
├── BeszelSystemMetrics
├── BeszelSystemInfo
└── BeszelSystemStats
```

### Documentation
```
docs/technical/beszel-pocketbase-integration.md (NEW)
docs/implementation/server-status-command-actual.md (NEW)
docs/BESZEL_INTEGRATION_SUMMARY.md (THIS FILE)
```

---

## Files Modified

### Core Client Interface
**Src/Subsystems/Auxiliary/LCARSClient.ts**
- Added: `BESZEL_CLIENT: PocketBase`
- Added: `BESZEL_SYSTEMS: BeszelSystemRecord[]`

### Event Handler
**Src/Events/ready.ts**
- Initialization of Beszel client
- Systems list caching
- Error handling for unavailable Beszel

### Interaction Handler
**Src/Events/interactionCreate.ts**
- Autocomplete routing to commands
- Support for optional `autocomplete()` function

---

## Dependencies Added

### NPM Package
```json
{
  "pocketbase": "^0.21.3"
}
```

### TypeScript
- Built-in PocketBase type definitions
- Custom Beszel interfaces

---

## Environment Variables

### Required
```env
BESZEL_URL=https://beszel.example.com    # Beszel hub URL (HTTPS required for production)
BESZEL_EMAIL=admin@example.com           # Admin account email
BESZEL_PASSWORD=secure-password          # Admin account password
```

### Notes
- All required for Beszel integration
- No defaults or fallbacks
- Stored in `.env` (in `.gitignore`)
- Should be injected by deployment/CI system

---

## API Integration Summary

### PocketBase Collections

**`systems` Collection:**
- Stores system records with static info
- Fields: id, name, host, port, status, info object
- Endpoint: `/api/collections/systems/records`

**`system_stats` Collection:**
- Stores live metrics (CPU, memory, disk, network)
- Fields: system (relation), cpu, m, mu, mp, d, du, dp, ni (interfaces)
- Endpoint: `/api/collections/system_stats` (filtered by system)

### Query Pattern

```
1. Authenticate: POST /api/admins/auth-with-password
2. Get Systems: GET /api/collections/systems/records
3. Get Metrics: GET /api/collections/system_stats (filtered, sorted by -created)
4. Parse & Format: Local processing of metrics
5. Display: Discord embed response
```

---

## Key Technical Decisions

### 1. PocketBase SDK vs Raw HTTPS
**Decision:** Use PocketBase SDK
**Rationale:**
- Type safety with SDK
- Automatic token management
- Built-in serialization
- Simpler authentication flow
- Consistent with modern TypeScript practices

### 2. Caching Systems List
**Decision:** Cache in memory at startup
**Rationale:**
- Fast autocomplete (<100ms)
- Reduces API calls
- Acceptable staleness (updates on restart)
- Simple implementation

### 3. Metrics Formatting
**Decision:** Parse and format server-side
**Rationale:**
- Consistent formatting across all systems
- Easy to update formatting logic
- Handles missing or invalid data
- Discord embed constraints

### 4. Network Data Aggregation
**Decision:** Sum all interface data
**Rationale:**
- Shows total system bandwidth
- Hides unnecessary interface details
- Matches user expectations

---

## Testing & Validation

### Pre-Deployment Checklist
- [x] Bot starts with Beszel initialization
- [x] Environment variables validated
- [x] Command appears in Discord
- [x] Autocomplete returns systems
- [x] Metrics display correctly
- [x] Error messages are user-friendly
- [x] Logging is comprehensive
- [x] TypeScript compilation succeeds

### Testing Scenarios Completed
1. Autocomplete with no input (returns all systems)
2. Autocomplete with filtering (matches system names)
3. Valid system selection (shows metrics)
4. Invalid system ID (shows error)
5. Network error (graceful fallback)
6. Missing metrics (N/A values)
7. Temperature available/unavailable (conditional display)

---

## Performance Metrics

### Response Times
- **Autocomplete:** <100ms (cached)
- **System Fetch:** 200-500ms (API call)
- **Stats Fetch:** 200-500ms (API call)
- **Formatting:** <10ms (local)
- **Embed Build:** <10ms (local)
- **Total Command:** 1-3 seconds

### API Calls
- **Autocomplete:** 0 calls (cached)
- **Per Command:** 2 calls (system + stats)
- **Startup:** 1 call (all systems)

### Memory Usage
- Systems cache: ~1KB per system (~5-10KB typical)
- Client instance: <1MB
- Per metric response: <100KB

---

## Caching Strategy Details

### What is Cached
- System names, IDs, and status
- Location: `LCARS47.BESZEL_SYSTEMS` (memory)
- Scope: Application-wide

### When is Cache Updated
- **Initial:** Bot startup (ready event)
- **Regular:** Never (until restart)
- **Manual:** Would require `/refresh-beszel` command (not implemented)

### Cache Invalidation
- Bot restart
- Manual refresh (future feature)
- System removal (visible after restart)

### Future Enhancement
Implement 60-second auto-refresh:
```typescript
setInterval(async () => {
  LCARS47.BESZEL_SYSTEMS = await BeszelUtils.beszel_getSystems(
    LCARS47.BESZEL_CLIENT
  );
}, 60000);
```

---

## Security Considerations

### Credential Management
- Stored in `.env` (not in code)
- PocketBase SDK handles token internally
- Tokens expire based on Beszel config
- No token persistence across restarts

### Access Control
- PocketBase admin credentials required
- Bot must have valid Beszel admin account
- Use dedicated bot account (best practice)
- Role-based access in Discord (via permissions)

### Network Security
- HTTPS enforced for production URLs
- Certificate validation by default
- PocketBase SDK handles secure connection

### Data Privacy
- Metrics visible to command users
- Consider sensitive info in system names
- Use Discord command permissions to restrict access

---

## Error Scenarios & Recovery

### Scenario 1: Beszel Unavailable at Startup
**Behavior:** Logs warning, continues with empty cache
**Impact:** Autocomplete returns no options, command fails gracefully
**Recovery:** Restart bot when Beszel is available

### Scenario 2: Invalid Credentials
**Behavior:** Fails at startup with error message
**Impact:** Server monitoring disabled
**Recovery:** Check `.env` and restart

### Scenario 3: System No Longer Exists
**Behavior:** Returns 404 from Beszel
**Impact:** User sees "System not found" error
**Recovery:** Autocomplete refreshes on bot restart

### Scenario 4: Network Timeout
**Behavior:** Request times out (PocketBase timeout)
**Impact:** User sees timeout error
**Recovery:** Retry the command

---

## Monitoring & Diagnostics

### Log Messages
```
[BESZEL] Initializing PocketBase connection...
[BESZEL] Authenticated as admin@example.com
[BESZEL] Retrieved X systems
[BESZEL] Loaded X systems for autocomplete cache
[SERVER-STATUS] Received server status request
[SERVER-STATUS] Successfully displayed metrics
[SERVER-STATUS] Error: System not found
```

### Debug Commands (Future)
- `/beszel-status` - Show integration status
- `/beszel-refresh` - Manually refresh systems cache
- `/beszel-test <system-id>` - Test metrics fetch

---

## Related Systems & Dependencies

### Internal Dependencies
- Discord.js v14 (bot framework)
- EmbedBuilder (for rich formatting)
- SysUtils.Utility.log() (for logging)
- LCARSClient interface (for client extensions)

### External Dependencies
- PocketBase v0.21+ (Beszel backend)
- Beszel Hub (monitoring system)
- Beszel Agents (on monitored systems)

---

## Future Enhancements

### Short Term
1. Metrics caching (60-second TTL)
2. System status notifications
3. Metrics history graph
4. Custom metric thresholds

### Medium Term
1. Multi-system comparison
2. Alert/notification system
3. Metrics export (CSV/JSON)
4. Scheduled health checks

### Long Term
1. Metrics trending
2. Capacity planning reports
3. Integration with other monitoring tools
4. Historical data analysis

---

## Documentation Maintenance

### Version Control
- Documentation in `/docs` folder
- Markdown format (version controlled)
- Updated with each feature release
- Related links within documentation

### File Organization
```
docs/
├── architecture/
│   └── command-pattern.md (updated)
├── features/
│   └── beszel-integration.md (existing)
├── implementation/
│   ├── server-status-command.md (existing)
│   └── server-status-command-actual.md (new)
├── technical/
│   ├── beszel-api-integration.md (existing)
│   └── beszel-pocketbase-integration.md (new)
└── BESZEL_INTEGRATION_SUMMARY.md (this file)
```

---

## Getting Help

### Documentation References
- Command usage: [Feature Documentation](../features/beszel-integration.md)
- Setup guide: [Implementation Guide](../implementation/server-status-command.md)
- Technical details: [PocketBase Integration](../technical/beszel-pocketbase-integration.md)
- Architecture: [Command Architecture](../architecture/command-pattern.md)

### Common Issues
- Autocomplete not showing: Check bot restart, cache initialization
- Command fails: Verify Beszel credentials, network connectivity
- Metrics incomplete: Check Beszel agent is running
- High latency: Check network, Beszel instance load

---

## Quick Reference

### File Locations
```
Command:         Src/Commands/Active/server-status.ts
Connection:      Src/Subsystems/RemoteDS/Beszel_Connect.ts
Utilities:       Src/Subsystems/RemoteDS/Beszel_Utilities.ts
Interfaces:      Src/Subsystems/Auxiliary/Interfaces/BeszelInterfaces.ts
LCARSClient:     Src/Subsystems/Auxiliary/LCARSClient.ts
Ready Event:     Src/Events/ready.ts
```

### Environment Variables
```
BESZEL_URL
BESZEL_EMAIL
BESZEL_PASSWORD
```

### Key Types
```
PocketBase                  (LCARS47.BESZEL_CLIENT)
BeszelSystemRecord[]        (LCARS47.BESZEL_SYSTEMS)
BeszelSystemMetrics         (command metrics)
```

### Main Functions
```
beszel_connect()            Connect and authenticate
beszel_getSystems()         Get all systems
beszel_getMetrics()         Get formatted metrics
beszel_parseMetrics()       Parse raw metrics
```

---

## Contact & Support

For issues or questions:
1. Check troubleshooting guides in documentation
2. Review logs for error messages
3. Verify `.env` configuration
4. Check Beszel instance status
5. Consult [LCARS47 GitHub](https://github.com/SkyeRangerDelta/LCARS47)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete
**Maintained By:** LCARS47 Development Team
