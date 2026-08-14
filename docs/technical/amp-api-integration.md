# AMP API Integration - Technical Documentation

**Repository:** [LCARS47](https://github.com/SkyeRangerDelta/LCARS47)
**Related Issue:** [#80](https://github.com/SkyeRangerDelta/LCARS47/issues/80)
**Tech Stack:** TypeScript, Node.js >=24, global `fetch`

---

## Table of Contents

1. [AMP Overview](#amp-overview)
2. [Protocol](#protocol)
3. [Authentication Flow](#authentication-flow)
4. [Instance Discovery](#instance-discovery)
5. [Per-Instance Calls](#per-instance-calls)
6. [Application State Enum](#application-state-enum)
7. [TypeScript Surface](#typescript-surface)
8. [Error Handling](#error-handling)
9. [Configuration](#configuration)
10. [Security Considerations](#security-considerations)

---

## AMP Overview

AMP (Application Management Panel) by CubeCoders is the game server control panel
running on **Impulse Controller** at `https://amp.pldyn.net`. It manages every
Planetary Dynamics game server instance.

The deployment is an **ADS controller** — a single panel that owns and proxies to
a set of managed instances. Instances are addressed by GUID and each runs its own
application module (Minecraft, Generic, etc.) exposing its own metric set.

The integration lives in `Src/Subsystems/AMP/` and is consumed by
`Src/Commands/Active/amp.ts`.

---

## Protocol

Every call is a **POST** to `{base}/API/{Module}/{Method}`:

| Element | Value |
| --- | --- |
| Method | `POST` (always — there are no GET endpoints) |
| `Content-Type` | `application/json` |
| `Accept` | `text/javascript` |
| Body | The method's parameters, plus `"SESSIONID": "<session>"` |

The session travels **in the request body**, not in a header or a cookie.

### Errors arrive with HTTP 200

This is the single most important property of the protocol. A rejected request
returns a 200 status line with one of two envelopes in the body:

```jsonc
// Fault envelope
{ "Title": "Unauthorized Access",
  "Message": "You do not have permission to use this method ... requires the Session.Exists permission.",
  "StackTrace": "..." }

// ActionResult envelope
{ "Status": false, "Reason": "No instance with ID 0000... exists." }
```

`res.ok` is therefore worthless for deciding success. `AMPClient.assertOk()`
inspects the body and is the only thing standing between a permission error and
a cheerful "server started!".

Note the strictness: `Status` is compared with `=== false`. `{ "Status": true }`
is a **successful** ActionResult, so a truthiness check would invert the meaning
of every action AMP accepts.

### Some methods return an empty body

`Core/Stop` and `Core/Kill` are declared `Void` and return an **empty 200 body**.
`res.json()` throws `SyntaxError: Unexpected end of JSON input` on that, so every
response is read with `res.text()` and parsed defensively — an empty body is
treated as `{}`.

---

## Authentication Flow

```
POST /API/Core/Login
{ "username": "...", "password": "...", "token": "", "rememberMe": true, "SESSIONID": "" }
  ->
{ "success": true, "resultReason": "", "permissions": [...],
  "sessionID": "…", "rememberMeToken": "…", "userInfo": {...} }
```

`AMPClient` manages the session with two complementary mechanisms — both are
needed:

- **Proactive TTL** (5 minutes, matching the reference SDK). Covers idle expiry.
- **Reactive retry.** A call that comes back with an `unauthorized` body clears
  the session, re-authenticates, and retries **exactly once**. Covers an AMP
  restart that invalidated sessions early. It never loops.

Login is **single-flight**: Discord autocomplete fires once per keystroke, and
without a shared promise a burst of typing would stampede `Core/Login`.

`rememberMeToken` is reused in the `token` field on subsequent logins. A stale
token is rejected outright, so the client drops it and retries once with the
password.

### Failure sentinels

- `success !== true` → `auth-failed`, surfacing `resultReason`.
- `sessionID === "00000000-0000-0000-0000-000000000000"` → AMP's
  not-authenticated sentinel, treated as an auth failure rather than a session.
- A `resultReason` mentioning two-factor produces an actionable message: the
  service account must not have 2FA enabled.

---

## Instance Discovery

```
POST /API/ADSModule/GetInstances  ->  [ { "AvailableInstances": [ ... ] }, ... ]
```

Returns an array of controller *targets*, each carrying an `AvailableInstances`
array. Some AMP versions wrap it as `{ "result": [...] }`; the client accepts
both.

Per-instance fields consumed by LCARS: `InstanceID`, `InstanceName`,
`FriendlyName`, `Description`, `Module`, `ModuleDisplayName`, `Running`,
`AppState`, `Suspended`, `IP`, `Port`, `IsHTTPS`, `DiskUsageMB`, `Metrics`,
`ApplicationEndpoints`, `Tags`.

> **The controller lists itself.** One entry has `Module === "ADS"` — that is the
> panel, not a game server. `listInstances()` filters it out. Stopping it would
> take the whole panel offline.

### Caching

The instance list is cached in the client with a **60 second TTL**.

Discord autocomplete fires once per keystroke against a hard ~3 second deadline
that **cannot be deferred**, so a live round trip per keystroke would hammer the
controller and risk blowing that deadline. Nothing user-facing goes stale as a
result: `status`, `start` and `stop` resolve the instance id from the cache but
always read live state from `Core/GetStatus`. Start and stop invalidate the cache
on completion.

---

## Per-Instance Calls

Instance-scoped methods are proxied through the controller:

```
POST /API/ADSModule/Servers/{instanceId}/API/{Module}/{Method}
```

Whether the **controller session** authorises straight through that proxy varies
by AMP configuration — the reference SDKs obtain a separate per-instance session
via `ADSModule/Servers/{id}/API/Core/Login` first.

`AMPClient.callInstance()` handles both and *learns which one applies*:

1. Try the request with the controller session.
2. If it succeeds, record `mode: 'ads'` for that instance — the probe is never
   repeated.
3. If it comes back `unauthorized`, perform a per-instance `Core/Login`, cache
   the resulting session as `mode: 'instance'`, and retry once.

The `[AMP] Controller session did not proxy to <name>; using a per-instance
login.` log line tells you which mode this controller actually uses.

### Actions

| Operation | Primary | Fallback |
| --- | --- | --- |
| Status | `Core/GetStatus` (proxied) | — |
| Start | `Core/Start` (proxied) | `ADSModule/StartInstance { InstanceName }` |
| Stop | `Core/Stop` (proxied) | `ADSModule/StopInstance { InstanceName }` |

The ADS-level fallback keys on `InstanceName` rather than the GUID, which is why
`startInstance()` / `stopInstance()` take the whole `AMPInstance` DTO instead of
a bare id.

`Core/GetStatus` returns:

```jsonc
{ "State": 20,
  "Uptime": "04:35:12",                         // .NET TimeSpan, `d.hh:mm:ss` when days are present
  "Metrics": { "CPU Usage":    { "RawValue": 42,   "MaxValue": 100,  "Percent": 42, "Units": "%" },
               "Memory Usage": { "RawValue": 3276, "MaxValue": 8192, "Percent": 40, "Units": "MB" },
               "Active Users": { "RawValue": 3,    "MaxValue": 20,   "Percent": 15, "Units": "" } } }
```

The metric dictionary is **module-defined and arbitrary**. Rendering iterates the
dictionary rather than reaching for known key names.

> **Acceptance is not completion.** Start and stop return as soon as AMP accepts
> the request. `Core/Stop` returning cleanly means *accepted*, not *stopped*. The
> `/amp` command polls `Core/GetStatus` every 3s (10 attempts, ~30s) for a
> terminal state, and reports "still starting" rather than claiming success when
> the budget runs out.

---

## Application State Enum

| Value | Name | | Value | Name |
| --- | --- | --- | --- | --- |
| -1 | Undefined | | 50 | Sleeping |
| 0 | Stopped | | 60 | Waiting |
| 5 | Pre-Start | | 70 | Installing |
| 7 | Configuring | | 75 | Updating |
| 10 | Starting | | 80 | Awaiting User Input |
| 20 | Ready | | 100 | Failed |
| 30 | Restarting | | 200 | Suspended |
| 40 | Stopping | | 250 | Maintenance |
| 45 | Preparing For Sleep | | 999 | Indeterminate |

Mapped in `Src/Subsystems/AMP/AMPFormat.ts` (`AMP_STATE_NAMES`), which also
supplies `stateLabel`, `stateEmoji`, `stateColour` and `isTransitional`. An
unrecognised value degrades to `Unknown (<n>)` rather than throwing.

---

## TypeScript Surface

`Src/Subsystems/AMP/AMPInterfaces.ts` holds the camelCase DTOs (`AMPInstance`,
`AMPStatus`, `AMPMetric`, `AMPActionResult`) plus the `Raw*` wire shapes, so the
PascalCase→camelCase mapping in `AMPClient` is type-checked rather than cast
blindly. AMP's wire format never escapes `AMPClient`.

`AMPClient` public surface:

```ts
static normaliseBaseUrl( url: string ): string
authenticate( force?: boolean ): Promise<void>
isReady(): boolean
getPermissions(): readonly string[]
listInstances( opts?: { force?: boolean } ): Promise<AMPInstance[]>
findInstance( idOrName: string ): Promise<AMPInstance | null>
getInstanceStatus( instance: AMPInstance ): Promise<AMPStatus>
startInstance( instance: AMPInstance ): Promise<AMPActionResult>
stopInstance( instance: AMPInstance ): Promise<AMPActionResult>
instanceCacheAgeMs(): number | null
invalidateInstanceCache(): void
```

`normaliseBaseUrl` defaults a scheme-less host to **https** (unlike
`JellyfinClient`, which defaults to http) because AMP behind the pldyn reverse
proxy is TLS-only and an http fallback fails opaquely. It also strips a trailing
`/API`, which is what you get pasting the URL out of AMP's own docs.

Credentials are supplied through an `AMPClientConfig` object rather than read
from `process.env` inside the class — the same choice that makes `JellyfinClient`
unit-testable. `fetchImpl` is injectable for the same reason.

---

## Error Handling

Every failure mode is normalised into an `AMPError` carrying a `kind`:

| Kind | Cause |
| --- | --- |
| `network` | fetch itself failed — DNS, TLS, connection refused. `detail` carries `err.cause.code` |
| `timeout` | AbortController fired (15s default) |
| `http` | genuine non-2xx, in practice a reverse-proxy 502/504 |
| `unauthorized` | session rejected, or the account lacks a permission node |
| `rejected` | AMP understood the request and refused it |
| `not-found` | no such instance |
| `malformed` | body was not JSON — a proxy error page, a truncated response |
| `auth-failed` | `Core/Login` itself failed |

`/amp` maps the kind to a human-actionable message. AMP's raw `Message` can quote
internal server paths, so it is only ever surfaced in an **ephemeral** reply.

A TLS problem surfaces as a bare `fetch failed`; the `cause.code` is the useful
part and is preserved in `AMPError.detail`. Do not reach for
`NODE_TLS_REJECT_UNAUTHORIZED=0`.

---

## Configuration

Feature group `amp` in `Src/Subsystems/Auxiliary/ENVChecks.json`
(`required_together: true`):

| Variable | Description |
| --- | --- |
| `AMP_URL` | Controller base URL, e.g. `https://amp.pldyn.net` |
| `AMP_USERNAME` | AMP API user |
| `AMP_PASSWORD` | Password for that user |

Optional gating: `ADMIN_USER_IDS` controls who may run `/amp start` and
`/amp stop`, falling back to the guild Administrator permission when unset.

> **None of the three may carry a `default`.** `isFeatureEnabled()` only requires
> vars *without* a default, so giving `AMP_URL` one would permanently enable the
> feature and crash `authenticate()` at boot on every deployment that does not
> use AMP.

Initialisation happens in `Src/Events/ready.ts` behind `isFeatureEnabled('amp')`,
inside a `try/catch` that warns and degrades rather than throwing. On success the
instance list is warmed immediately — the autocomplete path cannot afford a login
or a cold fetch inside Discord's 3s deadline.

---

## Security Considerations

- **Use a dedicated AMP API user.** It needs exactly
  `Core.AppManagement.StartApplication` and `Core.AppManagement.StopApplication`
  on the instances it should control, plus visibility of those instances. Not
  full admin.
- **No 2FA on that account.** `Core/Login` cannot complete a two-factor
  challenge; the client detects this and says so rather than failing opaquely.
- **Nothing secret is ever logged.** The password, `sessionID` and
  `rememberMeToken` are never interpolated into a log line.
- **Destructive actions are gated in code, not by Discord.**
  `setDefaultMemberPermissions()` applies to a whole command, so using it on
  `/amp` would hide the read-only `list` and `status` subcommands from ordinary
  users. `isAdminUser()` in `Src/Subsystems/Utilities/AuthUtils.ts` is therefore
  the only gate on start/stop, and deliberately does **not** fall open when
  `ADMIN_USER_IDS` is unset — it falls back to the guild Administrator
  permission.
- **API discovery is currently open on this AMP install.**
  `POST /API/Core/GetAPISpec` answers unauthenticated, exposing the full method
  surface and every permission node. Nothing in this integration depends on that;
  consider setting `Security.AllowAPIDiscoveryWithoutLogin=False` in
  `AMPConfig.conf`.
