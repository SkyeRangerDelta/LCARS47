// -- AMP Type Interfaces --
// DTOs for the CubeCoders AMP (Application Management Panel) integration.
//
// AMP speaks PascalCase over the wire; everything past AMPClient sees the
// camelCase DTOs below. The `Raw*` shapes describe the wire format and exist
// only so the mapping in AMPClient is type-checked rather than cast blindly.

/** AMP application state. See AMP_STATE_NAMES in AMPFormat.ts for the mapping. */
export type AMPState = number;

/** A single AMP metric (CPU Usage, Memory Usage, Active Users, ...). */
export interface AMPMetric {
  rawValue: number;
  maxValue: number;
  percent: number;
  units: string;
  shortName?: string;
}

/**
 * A game server instance managed by the AMP controller.
 *
 * Deliberately carries **no connection details** — no IP, port, published
 * endpoint or scheme. AMP reports the listening socket (`0.0.0.0:61230`), which
 * is not what anyone connects to, and the real connect details are handed out
 * selectively rather than published. `/amp status` is open to every guild
 * member, so the safe thing is for the data never to reach the DTO at all
 * rather than relying on nobody rendering it.
 *
 * If a connection display is ever wanted, it needs a deliberate design with a
 * public host mapping and an access decision — not a field quietly reinstated
 * here.
 */
export interface AMPInstance {
  instanceId: string;
  instanceName: string;
  friendlyName: string;
  targetId?: string;
  module: string;
  moduleDisplayName: string;
  description?: string;
  running: boolean;
  appState: AMPState;
  suspended: boolean;
  diskUsageMB?: number;
  metrics: Record<string, AMPMetric>;
  tags: string[];
}

/** Live status for one instance, from Core/GetStatus. */
export interface AMPStatus {
  state: AMPState;
  uptime: string;
  metrics: Record<string, AMPMetric>;
}

/** Outcome of a start/stop request. `accepted` never means "finished". */
export interface AMPActionResult {
  accepted: boolean;
  /** Set when the ADS-level fallback was used instead of the proxied call. */
  viaFallback?: boolean;
}

/**
 * Failure taxonomy. AMP returns HTTP 200 for nearly everything, so the kind is
 * derived from the response *body*, not the status code.
 */
export type AMPErrorKind =
  | 'network'       // fetch itself failed (DNS, TLS, connection refused)
  | 'timeout'       // AbortController fired
  | 'http'          // genuine non-2xx, usually a reverse-proxy 502/504
  | 'unauthorized'  // AMP rejected the session or the account lacks a permission
  | 'unavailable'   // the instance exists but its daemon is down, so the proxy cannot reach it
  | 'busy'          // another operator already has a control action running on this instance
  | 'rate-limited'  // AMP's brute-force protection is refusing logins for now
  | 'rejected'      // AMP understood the request and refused it
  | 'not-found'     // no such instance
  | 'malformed'     // body was not JSON (proxy error page, truncated response)
  | 'auth-failed';  // Core/Login itself failed

// -- Wire shapes ------------------------------------------------------------

export interface RawAMPMetric {
  RawValue?: number;
  MaxValue?: number;
  Percent?: number;
  Units?: string;
  ShortName?: string;
}

export interface RawAMPInstance {
  InstanceID?: string;
  InstanceName?: string;
  FriendlyName?: string;
  TargetID?: string;
  Description?: string;
  Module?: string;
  ModuleDisplayName?: string;
  Running?: boolean;
  AppState?: number;
  Suspended?: boolean;
  DiskUsageMB?: number;
  Metrics?: Record<string, RawAMPMetric>;
  Tags?: string[];
  // AMP also sends IP, Port, IsHTTPS and ApplicationEndpoints. They are
  // intentionally not declared here so they cannot be mapped by accident —
  // see the note on AMPInstance.
}

export interface RawAMPTarget {
  AvailableInstances?: RawAMPInstance[];
}

export interface RawAMPStatus {
  State?: number;
  Uptime?: string;
  Metrics?: Record<string, RawAMPMetric>;
}

export interface RawAMPLoginResult {
  success?: boolean;
  resultReason?: string;
  sessionID?: string;
  rememberMeToken?: string;
  permissions?: string[];
}

/** AMP's fault envelope — returned with HTTP 200. */
export interface RawAMPFault {
  Title?: string;
  Message?: string;
  StackTrace?: string;
}

/** AMP's ActionResult envelope — `Status: true` is a *success*. */
export interface RawAMPActionResult {
  Status?: boolean;
  Reason?: string;
}
