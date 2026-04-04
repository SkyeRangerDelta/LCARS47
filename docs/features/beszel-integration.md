# Beszel Integration Feature

**Repository:** [LCARS47](https://github.com/SkyeRangerDelta/LCARS47)
**Related Issue:** [#66](https://github.com/SkyeRangerDelta/LCARS47/issues/66)
**Branch:** system-status-command
**Bot Version:** LCARS47 v6.0.0-Experimental.2
**Feature Added:** v6.0.0-Experimental.2

---

## Overview

The Beszel integration enables LCARS47 Discord bot users to monitor server system metrics directly from Discord without leaving their conversation context. This feature connects to a self-hosted Beszel monitoring hub to retrieve real-time system information about servers and present it in a clean, Discord-native format.

### What is Beszel?

Beszel is a lightweight, self-hosted server monitoring solution built on PocketBase. It provides system metrics collection and aggregation for multiple servers through a RESTful API. Unlike heavier monitoring solutions, Beszel focuses on simplicity and low resource overhead while providing essential system metrics.

### Why Add This Feature?

**Use Cases:**
- **Quick System Checks:** DevOps team members can check server status without leaving Discord
- **On-Call Monitoring:** Get instant server health updates during incident response
- **Team Transparency:** Share system status with non-technical team members
- **Multi-Server Management:** Monitor multiple systems from a single command interface
- **Integration with Existing Workflows:** Combine with Discord notifications and bot automation

**Benefits:**
- No context switching between Discord and monitoring dashboards
- Immediate access to critical metrics (CPU, memory, disk, network)
- Team-friendly format that's easy to share and discuss
- Consistent with LCARS47's system utility command pattern
- Leverages existing Discord permissions and access control

---

## Command Usage

### `/server-status`

Retrieves real-time system metrics from a monitored server via the Beszel API.

**Syntax:**
```
/server-status system:<system-name>
```

**Parameters:**
- `system` (required, autocomplete): The name of the server system to query
  - Type: String (autocomplete-enabled)
  - Autocomplete dynamically fetches available systems from your Beszel instance
  - Shows all systems currently registered in your monitoring hub
  - Example values: "production-web-01", "database-primary", "backup-server"

**Example Usage:**
```
/server-status system:production-web-01
```

---

## Expected Output

The command returns a Discord embed with color-coded status information:

### Embed Structure

**Header:**
- **Title:** System name (e.g., "production-web-01")
- **Color:**
  - Green (#00FF00): System is online and healthy
  - Red (#FF0000): System is offline or unreachable
- **Timestamp:** Time the metrics were retrieved

**Metrics Fields:**

1. **Status**
   - Current operational state
   - Values: "online", "offline", "unknown"

2. **CPU Usage**
   - Current CPU utilization percentage
   - Format: "45.2%"
   - Calculated across all cores

3. **Memory**
   - RAM usage and total available
   - Format: "8.4 GB / 16 GB (52.5%)"
   - Shows used, total, and percentage

4. **Disk Usage**
   - Storage space consumption
   - Format: "124.8 GB / 500 GB (25%)"
   - Typically represents primary system disk

5. **Network**
   - Current network transfer rates
   - Format: "↓ 1.2 MB/s | ↑ 0.5 MB/s"
   - Download and upload speeds

6. **Uptime**
   - Time since last system boot
   - Format: "15d 4h 23m" or "2h 15m 30s"
   - Automatically formatted for readability

7. **Temperature** (if available)
   - System/CPU temperature
   - Format: "56°C"
   - Only displayed if hardware sensor data is available

### Example Output

```
┌─────────────────────────────────────┐
│  production-web-01                  │  🟢
├─────────────────────────────────────┤
│ Status: online                      │
│ CPU: 23.5%                          │
│ Memory: 12.3 GB / 32 GB (38%)       │
│ Disk: 245 GB / 1 TB (24%)           │
│ Network: ↓ 2.1 MB/s | ↑ 0.8 MB/s    │
│ Uptime: 45d 12h 34m                 │
│ Temperature: 52°C                   │
├─────────────────────────────────────┤
│ Retrieved at 2025-11-15 14:23:45    │
└─────────────────────────────────────┘
```

---

## Metrics Explained

### CPU Usage
- **What it shows:** Percentage of CPU capacity currently in use
- **Range:** 0-100%
- **Interpretation:**
  - 0-50%: Normal operation
  - 50-80%: Moderate load
  - 80-100%: High load, potential performance impact
- **Note:** Averaged across all CPU cores

### Memory Usage
- **What it shows:** RAM consumption vs. total available
- **Format:** Used / Total (Percentage)
- **Interpretation:**
  - <70%: Healthy
  - 70-90%: Monitor for potential issues
  - >90%: Critical, may cause performance degradation or OOM errors
- **Note:** Does not include swap/page file

### Disk Usage
- **What it shows:** Primary disk space consumption
- **Format:** Used / Total (Percentage)
- **Interpretation:**
  - <80%: Healthy
  - 80-95%: Plan capacity expansion
  - >95%: Critical, immediate action required
- **Note:** Typically shows root/system partition

### Network Transfer
- **What it shows:** Current network I/O rates
- **Format:** Download speed | Upload speed
- **Units:** MB/s (megabytes per second)
- **Interpretation:** Contextual to workload
  - Web server: Higher download typical
  - Backup server: Higher upload during backups
  - Database: Variable bidirectional traffic

### Uptime
- **What it shows:** Time elapsed since last system boot
- **Format:** Days, hours, minutes
- **Interpretation:**
  - Long uptime: System stability (but may need patching)
  - Recent reboot: Check for maintenance or crashes
- **Note:** Resets after system restart, not process restart

### Temperature
- **What it shows:** CPU or system temperature from hardware sensors
- **Format:** Degrees Celsius
- **Interpretation:**
  - <60°C: Normal
  - 60-80°C: Moderate, check cooling
  - >80°C: High, investigate immediately
- **Note:** Only available if Beszel agent has sensor access

---

## Access Requirements

### User Permissions
- Standard Discord server members can use this command
- No elevated Discord permissions required by default
- Server admins can restrict via Discord's command permissions system

### Bot Requirements
- LCARS47 must be running and connected to Discord
- Beszel instance must be accessible from bot's network
- Valid Beszel admin credentials configured in environment variables
- HTTPS connection recommended for production environments

### Environment Configuration
Required environment variables (see [Technical Documentation](../technical/beszel-api-integration.md)):
- `BESZEL_URL`: URL to Beszel instance
- `BESZEL_EMAIL`: Admin account email
- `BESZEL_PASSWORD`: Admin account password

---

## Use Case Scenarios

### Scenario 1: Incident Response
**Situation:** Production alert triggered, team discussing in Discord
**Action:** DevOps engineer runs `/server-status system:production-web-01`
**Outcome:** Team immediately sees CPU is at 98%, identifies resource exhaustion
**Benefit:** Faster diagnosis without tool switching

### Scenario 2: Daily Health Check
**Situation:** Team standup meeting in Discord voice channel
**Action:** SRE runs `/server-status` for each critical system
**Outcome:** Quick visual confirmation all systems healthy
**Benefit:** Proactive monitoring integrated into existing workflow

### Scenario 3: Capacity Planning Discussion
**Situation:** Team discussing whether to scale infrastructure
**Action:** Engineer shares `/server-status` output showing 85% memory usage
**Outcome:** Data-driven decision with concrete metrics
**Benefit:** Evidence directly in conversation thread

### Scenario 4: Client Status Update
**Situation:** Client asks about server health in support channel
**Action:** Support staff runs `/server-status system:client-prod`
**Outcome:** Professional, real-time status report shared with client
**Benefit:** Transparency builds trust, no manual data gathering

### Scenario 5: After-Hours Monitoring
**Situation:** On-call engineer receives alert via Discord
**Action:** Check system status from mobile Discord app
**Outcome:** Determine if immediate intervention needed or can wait
**Benefit:** Mobile-friendly monitoring without VPN or laptop

---

## Limitations and Considerations

### Current Limitations
- Read-only monitoring (no control actions)
- Metrics are point-in-time snapshots (not historical)
- Requires Beszel instance to be network-accessible
- Authentication token stored in memory (resets on bot restart)
- No metric alerting or threshold notifications
- Single Beszel instance per bot (no multi-tenant support)

### Privacy and Security
- Server metrics are visible to anyone who can use the command
- Use Discord's command permissions to restrict access if needed
- Credentials stored in environment variables (never in code)
- HTTPS strongly recommended for production
- Consider network segmentation for Beszel instance

### Performance Considerations
- Each command makes 1-2 API calls to Beszel
- Response time typically <2 seconds
- Autocomplete triggers API call for system list
- No caching implemented (always fetches fresh data)
- Rate limiting depends on Beszel instance configuration

---

## Troubleshooting

### Command Not Appearing
**Symptom:** `/server-status` doesn't show in autocomplete
**Solutions:**
- Verify bot has been restarted after deployment
- Check Discord command registration (may take up to 1 hour)
- Ensure bot has `applications.commands` scope

### Autocomplete Shows No Systems
**Symptom:** System parameter has no options
**Solutions:**
- Verify Beszel URL is correct in environment variables
- Check Beszel instance has systems registered
- Review bot logs for authentication errors
- Confirm network connectivity to Beszel instance

### "Authentication Failed" Error
**Symptom:** Command returns authentication error
**Solutions:**
- Verify BESZEL_EMAIL and BESZEL_PASSWORD are correct
- Check Beszel admin account is active
- Review Beszel instance logs for failed login attempts
- Restart bot to clear token cache

### "System Not Found" Error
**Symptom:** Selected system returns not found
**Solutions:**
- System may have been removed from Beszel
- Try re-running command (autocomplete will refresh)
- Verify system ID hasn't changed in Beszel

### Timeout or No Response
**Symptom:** Command hangs or times out
**Solutions:**
- Check Beszel instance is running and accessible
- Verify network connectivity from bot to Beszel
- Review firewall rules blocking HTTPS traffic
- Check Beszel instance performance (may be overloaded)

---

## Related Documentation

- [Technical API Integration Guide](../technical/beszel-api-integration.md)
- [Implementation Guide](../implementation/server-status-command.md)
- [Command Architecture Reference](../architecture/command-pattern.md)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** LCARS47 Development Team
