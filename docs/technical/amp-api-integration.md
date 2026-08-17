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

### The two control layers

This is the thing to understand before anything else, because almost every other
design decision follows from it. AMP has **two independently controlled layers**:

| Layer | Field | What it is | Controlled by |
| --- | --- | --- | --- |
| Instance daemon | `Running` | the AMP instance process — "the machine" | the **controller**: `ADSModule/StartInstance` / `StopInstance` |
| Application | `AppState` | the game server inside it — "the service" | the **proxy**: `Core/Start` / `Core/Stop` |

They are not interchangeable, and the routes are not fallbacks for one another:

- An instance with `Running: false` **cannot be reached through the proxy at
  all**. Every proxied call — including the per-instance `Core/Login` — answers
  `{"Title":"Instance Unavailable","Message":"The requested instance is not
  available at this time."}`. So the only way to bring one up is via the
  controller.
- `ADSModule/StartInstance` starts the daemon and **does not start the
  application** (on this deployment, by configuration and by preference). A
  freshly started instance sits at `Running: true, AppState: 0`.

> **`AppState` is `-1` whenever `Running` is `false`.** Verified across all 20
> instances on the live controller. This is not a bug or a missing field: AMP
> has nothing to say about an application that is not there to be asked, so it
> reports Undefined. Reading `AppState` alone therefore makes every powered-off
> game server display as "Undefined" — `Running` is the field that answers "is
> this thing on". `instanceState()` in `AMPFormat.ts` checks it first.

`/amp` mirrors the split rather than hiding it: `/amp instance start|stop` drives
the daemon, `/amp server start|stop` drives the application, and neither silently
does the other's job.

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
`AppState`, `Suspended`, `DiskUsageMB`, `Metrics`, `Tags`.

> **Connection details are deliberately not consumed.** AMP also sends `IP`,
> `Port`, `IsHTTPS` and a fully populated `ApplicationEndpoints` array. None of
> them are declared on `RawAMPInstance` or mapped onto `AMPInstance`, so they
> cannot reach an embed by accident.
>
> Two reasons. The address AMP reports is the listening socket
> (`Minecraft Server Address=0.0.0.0:61230`), which is not what anyone connects
> to and would simply be wrong. And `/amp status` is open to every guild member,
> while real connect details are handed out selectively. Reinstating any of this
> needs a deliberate design — a public host mapping and an access decision — not
> a field quietly added back to the DTO.

> **The controller lists itself.** One entry has `Module === "ADS"` — that is the
> panel, not a game server. `listInstances()` filters it out. Stopping it would
> take the whole panel offline.

### GetInstances is a stale snapshot — this matters everywhere

**`ADSModule/GetInstances` is not live data.** The controller keeps a cached view
of its targets and refreshes it on its own slow schedule. Measured against
`amp.pldyn.net`: polling both sources every 2 seconds for 30 seconds, the
aggregate's `AppState`, `Running` and `Metrics` **did not change once** — memory
pinned at exactly 2341 MB — while a direct `Core/GetStatus` on the same instance
updated on every single sample.

```
t+ 0.0s  aggregate=[20,true,2341,0]   direct=[20,"0:10:59:42",2341,0]
t+ 2.0s  aggregate=[20,true,2341,0]   direct=[20,"0:10:59:44",2341,0]
...
t+28.4s  aggregate=[20,true,2341,0]   direct=[20,"0:11:00:10",2341,0]

aggregate changed at: 0.0
direct    changed at: 0.0, 2.0, 4.1, 6.1, ... 28.4
```

Consequences, all of which the integration has to work around:

- **`Running` lags reality by tens of seconds.** Polling it to decide whether a
  freshly started instance is up produces exactly the symptom it is meant to
  detect: a long window reporting the instance as still down.
- **`AppState` lags too**, so straight after a start or stop the aggregate keeps
  reporting the previous application state.
- **There is a window where `Running: true` and `AppState: -1`** — the daemon is
  up but the controller has not re-polled the application yet. `instanceState()`
  renders this as *Initialising*, not *Undefined*.
- **Invalidating the client cache does not help.** The staleness is server-side.
  Refetching just fetches the same snapshot again.

The rule that follows: **use the proxy wherever the answer matters.** The proxied
`Core/GetStatus` is authoritative and immediate. The aggregate is only good
enough for picker labels.

| Consumer | Source | Why |
| --- | --- | --- |
| Autocomplete | aggregate, 60s client cache | 3s deadline, cannot defer; a label being a minute stale is survivable |
| `/amp list` | aggregate for the roster, **direct probe per online instance** | roster must be complete, states must be true |
| `/amp status` | direct | it is the whole point of the command |
| Readiness polling | direct | see `probeInstance` below |

### Readiness: probe the proxy, not the flag

`probeInstance()` resolves to `null` when the daemon is down and to the live
status when it is up. That single call is a better readiness signal than the
`Running` flag, because the proxy either answers or it does not — there is no
cache in front of it:

```ts
const status = await amp.probeInstance( instance );
// null            -> daemon genuinely down
// { state: 0 }    -> daemon genuinely up, application stopped
// { state: -1 }   -> up but not settled; keep polling
```

`/amp instance start` polls this until it returns a status with a real state, and
`/amp instance stop` polls it until it returns `null`. Neither consults
`GetInstances` for readiness at all.

### Client-side caching

On top of all that, the client caches the instance list for **60 seconds**,
purely to keep autocomplete off the network — it fires once per keystroke against
a hard ~3 second deadline that cannot be deferred. `/amp list` bypasses the cache
and then hydrates; control commands invalidate it on completion, and also drop
any cached proxy session for a restarted instance, since a session from the
instance's previous life is dead.

---

## Per-Instance Calls

Instance-scoped methods are proxied through the controller:

```
POST /API/ADSModule/Servers/{instanceId}/API/{Module}/{Method}
```

Whether the **controller session** authorises straight through that proxy varies
by AMP configuration — the reference SDKs obtain a separate per-instance session
via `ADSModule/Servers/{id}/API/Core/Login` first.

> **On this controller it does not.** Verified against `amp.pldyn.net`: a
> proxied `Core/GetStatus` carrying the controller session is refused with
> `Unauthorized Access … requires the Session.Exists permission`, while a
> per-instance `Core/Login` succeeds and its session works. So the per-instance
> login is the live path here, not an edge case.

`AMPClient.callInstance()` handles both and *learns which one applies*:

1. Try the request with the controller session.
2. If it succeeds, record `mode: 'ads'` for that instance — the probe is never
   repeated.
3. If it comes back `unauthorized`, perform a per-instance `Core/Login`, cache
   the resulting session as `mode: 'instance'`, and retry once.

The `[AMP] Controller session did not proxy to <name>; using a per-instance
login.` log line tells you which mode is in play.

### Routes by layer

| Operation | Route | Layer |
| --- | --- | --- |
| List instances | `ADSModule/GetInstances` | controller |
| Start instance | `ADSModule/StartInstance { InstanceName }` | controller |
| Stop instance | `ADSModule/StopInstance { InstanceName }` | controller |
| Status | `Core/GetStatus` (proxied) | application |
| Start server | `Core/Start` (proxied) | application |
| Stop server | `Core/Stop` (proxied) | application |

These are **not** fallbacks for one another — `startInstance()` and
`startApplication()` are separate methods, and neither silently retries via the
other. A conflated version would have quietly powered on a machine when the
operator only asked to start a service, and vice versa.

> **The instance methods key on `InstanceName`, not the GUID.** Verified: passing
> a GUID answers `{"Status":false,"Reason":"No such instance with this name"}`.
> `InstanceName` is AMP's internal short name (`PlDynEmpyrion01`), distinct from
> `FriendlyName` (`PlDyn Empyrion`). This is why the control methods take the
> whole `AMPInstance` DTO rather than a bare id.

`Core/GetStatus` returns:

```jsonc
{ "State": 20,
  "Uptime": "0:10:29:25",                       // see the uptime note below
  "Metrics": { "CPU Usage":    { "RawValue": 0,    "MaxValue": 100,   "Percent": 0,  "Units": "%",   "ShortName": "CPU" },
               "Memory Usage": { "RawValue": 2341, "MaxValue": 16384, "Percent": 14, "Units": "MB",  "ShortName": "RAM" },
               "Active Users": { "RawValue": 0,    "MaxValue": 25,    "Percent": 0,  "Units": "",    "ShortName": "Users" },
               "TPS":          { "RawValue": 20,   "MaxValue": 20,    "Percent": 0,  "Units": "TPS", "ShortName": null } } }
```

The metric dictionary is **module-defined and arbitrary** — the `TPS` entry above
comes from the Minecraft module and does not exist elsewhere. Rendering iterates
the dictionary rather than reaching for known key names.

> **Uptime has more than one shape.** AMP emits `hh:mm:ss` for short uptimes but
> `d:hh:mm:ss` once days are involved — the sample above is ten and a half hours,
> not ten minutes. AMP's own SDKs document the .NET TimeSpan spelling
> `d.hh:mm:ss` as well. `formatUptime()` normalises the day separator and
> fractional seconds before parsing rather than pattern-matching each form, so
> all three work.

`GetInstances` also carries a `Metrics` dictionary per running instance with the
same content, which is why `/amp list` can show state without a per-instance
login.

> **Acceptance is not completion.** Every control call returns as soon as AMP
> accepts the request. `Core/Stop` returning cleanly means *accepted*, not
> *stopped*. `/amp` polls every 3s (10 attempts, ~30s) for a settled state —
> `GetInstances` for `Running` on instance actions, `Core/GetStatus` for
> `AppState` on server actions — and reports "still starting" rather than
> claiming success when the budget runs out.

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

**Do not display `AppState` on its own.** Use `instanceState( running, appState )`
instead — it reports `Offline` whenever the daemon is down, which is the case for
the `-1` values AMP returns for every stopped instance. `stateLabel()` is only
correct when you already know the daemon is up, which is why `buildStatusEmbed()`
may use it directly: reaching that function means a `Core/GetStatus` succeeded,
and that is itself proof the instance is running.

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
probeInstance( instance: AMPInstance ): Promise<AMPStatus | null>   // null = daemon down

// instance layer — the daemon, via the controller
startInstance( instance: AMPInstance ): Promise<AMPActionResult>
stopInstance( instance: AMPInstance ): Promise<AMPActionResult>

// application layer — the game server, via the proxy
startApplication( instance: AMPInstance ): Promise<AMPActionResult>
stopApplication( instance: AMPInstance ): Promise<AMPActionResult>

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
| `unavailable` | the instance exists but its daemon is down, so the proxy cannot reach it |
| `rejected` | AMP understood the request and refused it |
| `not-found` | no such instance — both the proxy router's "No instance with ID …" and the controller's "No such instance with this name" |
| `malformed` | body was not JSON — a proxy error page, a truncated response |
| `auth-failed` | `Core/Login` itself failed |

`unavailable` earns its own kind rather than being lumped in with `rejected`
because it is not a refusal — it means "this instance's daemon is down, go
through the controller instead". `/amp` turns it into a pointer at
`/amp instance start` rather than an error.

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
