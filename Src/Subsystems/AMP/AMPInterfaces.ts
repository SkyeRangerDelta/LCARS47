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

/** A published application endpoint (e.g. the game server's connect address). */
export interface AMPEndpoint {
  displayName: string;
  endpoint: string;
}

/** A game server instance managed by the AMP controller. */
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
  ip?: string;
  port?: number;
  isHttps: boolean;
  diskUsageMB?: number;
  metrics: Record<string, AMPMetric>;
  endpoints: AMPEndpoint[];
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
  IsHTTPS?: boolean;
  IP?: string;
  Port?: number;
  DiskUsageMB?: number;
  Metrics?: Record<string, RawAMPMetric>;
  ApplicationEndpoints?: { DisplayName?: string; Endpoint?: string }[];
  Tags?: string[];
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
