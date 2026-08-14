// -- AMPClient --
// Client for the CubeCoders AMP (Application Management Panel) controller on
// Impulse Controller. Callers receive plain DTOs from AMPInterfaces.ts and
// never see AMP's PascalCase wire format.
//
// Lifecycle:
//   const amp = new AMPClient( config );
//   await amp.authenticate();
//   const instances = await amp.listInstances();
//   await amp.startInstance( instances[0] );
//
// Two things about AMP's protocol drive most of the design here:
//
//   1. AMP answers HTTP 200 for nearly every failure. A rejected request comes
//      back as `{Title, Message, StackTrace}` or `{Status:false, Reason}` with
//      a 200 status line, so `res.ok` proves nothing — assertOk() inspects the
//      body and is the only thing standing between a permission error and a
//      cheerful "server started!".
//   2. Some methods (Core/Stop) return `Void` — an *empty* 200 body. res.json()
//      throws on that, so every response is read with res.text() and parsed
//      defensively.
//
// Per-instance calls are proxied through the controller at
// /API/ADSModule/Servers/{id}/API/{Module}/{Method}. Whether the ADS-level
// session authorises straight through that proxy varies by AMP configuration,
// so callInstance() tries it, falls back to a per-instance Core/Login, and
// caches which mode worked for each instance.

import Utility from '../Utilities/SysUtils.js';
import type {
  AMPActionResult,
  AMPEndpoint,
  AMPErrorKind,
  AMPInstance,
  AMPMetric,
  AMPStatus,
  RawAMPActionResult,
  RawAMPFault,
  RawAMPInstance,
  RawAMPLoginResult,
  RawAMPMetric,
  RawAMPStatus,
  RawAMPTarget
} from './AMPInterfaces.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_SESSION_TTL_MS = 5 * 60_000;
const DEFAULT_INSTANCE_CACHE_TTL_MS = 60_000;
const USER_AGENT = 'LCARS47 (https://pldyn.net)';

/** AMP hands this back instead of a session id when authentication failed. */
const NULL_SESSION = '00000000-0000-0000-0000-000000000000';

export interface AMPClientConfig {
  /** Controller base URL, e.g. https://amp.pldyn.net */
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs?: number;
  sessionTtlMs?: number;
  instanceCacheTtlMs?: number;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export class AMPError extends Error {
  readonly kind: AMPErrorKind;
  readonly detail?: string;

  constructor( kind: AMPErrorKind, message: string, detail?: string ) {
    super( message );
    this.name = 'AMPError';
    this.kind = kind;
    this.detail = detail;
    Object.setPrototypeOf( this, AMPError.prototype );
  }
}

interface InstanceSession {
  sessionId: string;
  lastCallAt: number;
  /** 'ads' means the controller session proxies through; 'instance' means it needed its own login. */
  mode: 'ads' | 'instance';
}

export class AMPClient {
  readonly baseUrl: string;

  private readonly config: AMPClientConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly sessionTtlMs: number;
  private readonly instanceCacheTtlMs: number;

  private sessionId: string | null = null;
  private rememberMeToken: string | null = null;
  private permissions: string[] = [];
  private lastCallAt = 0;
  private loginPromise: Promise<void> | null = null;

  private readonly instanceSessions = new Map<string, InstanceSession>();
  private instanceCache: { at: number; items: AMPInstance[] } | null = null;

  constructor( config: AMPClientConfig ) {
    this.config = config;
    this.baseUrl = AMPClient.normaliseBaseUrl( config.baseUrl );
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.instanceCacheTtlMs = config.instanceCacheTtlMs ?? DEFAULT_INSTANCE_CACHE_TTL_MS;
  }

  /**
   * AMP behind the pldyn reverse proxy is TLS-only, so a scheme-less host
   * defaults to https — an http fallback fails opaquely rather than
   * redirecting. A trailing `/API` is stripped because that is what you get
   * pasting the URL straight out of AMP's own docs.
   */
  static normaliseBaseUrl( url: string ): string {
    let trimmed = url.trim().replace( /\/+$/, '' ).replace( /\/API$/i, '' ).replace( /\/+$/, '' );
    if ( !/^https?:\/\//i.test( trimmed ) ) {
      trimmed = `https://${ trimmed }`;
    }
    return trimmed;
  }

  isReady(): boolean {
    return this.sessionId != null;
  }

  /** Permission nodes granted to the configured account, populated at login. */
  getPermissions(): readonly string[] {
    return this.permissions;
  }

  /** Age of the cached instance list in ms, or null if nothing is cached. */
  instanceCacheAgeMs(): number | null {
    return this.instanceCache == null ? null : Date.now() - this.instanceCache.at;
  }

  invalidateInstanceCache(): void {
    this.instanceCache = null;
  }

  // -- Authentication -------------------------------------------------------

  /**
   * Log in, unless a session already exists and `force` is not set.
   *
   * Single-flight: autocomplete fires once per keystroke, so without the
   * shared promise a burst of typing would stampede Core/Login.
   */
  async authenticate( force = false ): Promise<void> {
    if ( !force && this.sessionId != null ) return;

    if ( this.loginPromise != null ) {
      await this.loginPromise;
      return;
    }

    const attempt = this.performLogin();
    this.loginPromise = attempt;

    try {
      await attempt;
    }
    finally {
      this.loginPromise = null;
    }
  }

  private async performLogin(): Promise<void> {
    const attempt = async ( token: string ): Promise<RawAMPLoginResult> =>
      await this.request<RawAMPLoginResult>( 'Core/Login', {
        username: this.config.username,
        password: this.config.password,
        token,
        rememberMe: true
      }, '' );

    let result = await attempt( this.rememberMeToken ?? '' );

    // A stale remember-me token is rejected outright — drop it and use the password.
    if ( result.success !== true && this.rememberMeToken != null ) {
      this.rememberMeToken = null;
      result = await attempt( '' );
    }

    if ( result.success !== true || result.sessionID == null || result.sessionID === NULL_SESSION ) {
      const reason = result.resultReason ?? 'AMP rejected the supplied credentials.';
      if ( /two.?factor|2fa|authenticator/i.test( reason ) ) {
        throw new AMPError( 'auth-failed',
          `AMP account requires two-factor authentication (${ reason }). Create a dedicated API user without 2FA.` );
      }
      throw new AMPError( 'auth-failed', reason );
    }

    this.sessionId = result.sessionID;
    this.rememberMeToken = result.rememberMeToken ?? null;
    this.permissions = result.permissions ?? [];
    this.lastCallAt = Date.now();

    Utility.log( 'proc', `[AMP] Authenticated as ${ this.config.username }.` );
  }

  /** Returns a usable controller session, logging in if the TTL has lapsed. */
  private async ensureSession(): Promise<string> {
    if ( this.sessionId == null || Date.now() - this.lastCallAt > this.sessionTtlMs ) {
      await this.authenticate( true );
    }

    const session = this.sessionId;
    if ( session == null ) {
      throw new AMPError( 'auth-failed', 'AMP session unavailable after a successful login.' );
    }
    return session;
  }

  // -- Transport ------------------------------------------------------------

  /**
   * One AMP request. No session management — callers supply the session id.
   * Every AMP failure mode is normalised into an AMPError here.
   */
  private async request<T>( path: string, params: Record<string, unknown>, sessionId: string ): Promise<T> {
    const url = `${ this.baseUrl }/API/${ path }`;
    const controller = new AbortController();
    const timer = setTimeout( () => controller.abort(), this.timeoutMs );

    try {
      let res: Response;
      try {
        res = await this.fetchImpl( url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/javascript',
            'User-Agent': USER_AGENT
          },
          body: JSON.stringify( { ...params, SESSIONID: sessionId } ),
          signal: controller.signal
        } );
      }
      catch ( err ) {
        const e = err as Error & { cause?: { code?: string } };
        if ( e.name === 'AbortError' ) {
          throw new AMPError( 'timeout', `AMP request to ${ path } timed out after ${ this.timeoutMs }ms.` );
        }
        // A TLS or DNS problem surfaces as a bare 'fetch failed'; the cause code is the useful part.
        throw new AMPError( 'network', `AMP request to ${ path } failed: ${ e.message }`, e.cause?.code );
      }

      // Genuine non-2xx still happens — a reverse proxy 502/504 in front of AMP.
      if ( !res.ok ) {
        throw new AMPError( 'http', `AMP returned HTTP ${ res.status } for ${ path }.` );
      }

      const text = await res.text();

      // Core/Stop and friends return Void: an empty 200 body. res.json() would throw.
      let body: unknown = {};
      if ( text.trim() !== '' ) {
        try {
          body = JSON.parse( text ) as unknown;
        }
        catch {
          throw new AMPError( 'malformed', `AMP returned a non-JSON body for ${ path }.`, text.slice( 0, 200 ) );
        }
      }

      AMPClient.assertOk( body );
      this.lastCallAt = Date.now();

      return body as T;
    }
    finally {
      clearTimeout( timer );
    }
  }

  /**
   * AMP signals failure in the body, with a 200 status line. Two envelopes:
   * a fault ({Title, Message, StackTrace}) and an ActionResult ({Status, Reason}).
   *
   * The Status check is strict identity on purpose — `{Status: true}` is a
   * *successful* ActionResult, so a truthiness test would invert the meaning
   * of every action AMP accepts.
   */
  private static assertOk( body: unknown ): void {
    if ( body == null || typeof body !== 'object' ) return;

    const fault = body as RawAMPFault;
    if ( typeof fault.Title === 'string' && typeof fault.Message === 'string' ) {
      throw new AMPError( AMPClient.classifyFault( fault ), `${ fault.Title }: ${ fault.Message }` );
    }

    const action = body as RawAMPActionResult;
    if ( action.Status === false ) {
      const reason = action.Reason ?? 'AMP rejected the request without giving a reason.';
      // "No instance with ID … exists." from the proxy router;
      // "No such instance with this name" from the ADS-level instance methods.
      const kind: AMPErrorKind = /no (such )?instance with/i.test( reason ) ? 'not-found' : 'rejected';
      throw new AMPError( kind, reason );
    }
  }

  /**
   * Sort AMP's fault envelopes into something callers can branch on.
   *
   * "Instance Unavailable" is its own case and must not be lumped in with a
   * generic refusal: it is what every proxied call returns when the target
   * instance's daemon is down, including the per-instance Core/Login. It means
   * "go through the controller instead", not "you did something wrong".
   */
  private static classifyFault( fault: RawAMPFault ): AMPErrorKind {
    const message = fault.Message ?? '';
    const title = fault.Title ?? '';

    if ( /instance (is )?unavailable|not available at this time/i.test( `${ title } ${ message }` ) ) {
      return 'unavailable';
    }
    if ( /unauthori[sz]ed|permission|session/i.test( message ) ) {
      return 'unauthorized';
    }
    return 'rejected';
  }

  /**
   * A controller-level call. Retries exactly once on an auth failure — the
   * proactive TTL in ensureSession() covers idle expiry, this covers an AMP
   * restart that invalidated sessions early.
   */
  private async call<T>( path: string, params: Record<string, unknown> = {} ): Promise<T> {
    const session = await this.ensureSession();

    try {
      return await this.request<T>( path, params, session );
    }
    catch ( err ) {
      if ( !( err instanceof AMPError ) || err.kind !== 'unauthorized' ) throw err;

      Utility.log( 'info', `[AMP] Session rejected on ${ path }; re-authenticating.` );
      this.sessionId = null;
      const fresh = await this.ensureSession();
      return await this.request<T>( path, params, fresh );
    }
  }

  /**
   * A per-instance call, proxied through the controller.
   *
   * Route selection is learned per instance: try the controller session, and
   * only pay for a per-instance Core/Login if AMP refuses it. Whichever mode
   * works is cached so the probe happens at most once per instance.
   */
  private async callInstance<T>(
    instance: AMPInstance,
    module: string,
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const path = `ADSModule/Servers/${ instance.instanceId }/API/${ module }/${ method }`;
    const cached = this.instanceSessions.get( instance.instanceId );

    if ( cached?.mode === 'instance' && Date.now() - cached.lastCallAt <= this.sessionTtlMs ) {
      try {
        const out = await this.request<T>( path, params, cached.sessionId );
        cached.lastCallAt = Date.now();
        return out;
      }
      catch ( err ) {
        if ( !( err instanceof AMPError ) || err.kind !== 'unauthorized' ) throw err;
        this.instanceSessions.delete( instance.instanceId );
      }
    }

    const adsSession = await this.ensureSession();
    try {
      const out = await this.request<T>( path, params, adsSession );
      this.instanceSessions.set( instance.instanceId, { sessionId: adsSession, lastCallAt: Date.now(), mode: 'ads' } );
      return out;
    }
    catch ( err ) {
      if ( !( err instanceof AMPError ) || err.kind !== 'unauthorized' ) throw err;
    }

    Utility.log( 'info',
      `[AMP] Controller session did not proxy to ${ instance.friendlyName }; using a per-instance login.` );

    const instanceSession = await this.loginInstance( instance.instanceId );
    return await this.request<T>( path, params, instanceSession );
  }

  private async loginInstance( instanceId: string ): Promise<string> {
    const result = await this.request<RawAMPLoginResult>(
      `ADSModule/Servers/${ instanceId }/API/Core/Login`,
      {
        username: this.config.username,
        password: this.config.password,
        token: '',
        rememberMe: false
      },
      ''
    );

    if ( result.success !== true || result.sessionID == null || result.sessionID === NULL_SESSION ) {
      throw new AMPError( 'unauthorized',
        result.resultReason ?? `AMP refused a per-instance login for ${ instanceId }.` );
    }

    this.instanceSessions.set( instanceId, {
      sessionId: result.sessionID,
      lastCallAt: Date.now(),
      mode: 'instance'
    } );

    return result.sessionID;
  }

  // -- Instances ------------------------------------------------------------

  /**
   * List every game server instance on the controller.
   *
   * Cached with a short TTL because Discord autocomplete fires once per
   * keystroke against a hard ~3s deadline that cannot be deferred — a live
   * round trip per keystroke would hammer the controller and risk blowing it.
   *
   * **The data behind this is not live, and invalidating the cache does not
   * make it live.** ADSModule/GetInstances is a snapshot the controller keeps
   * of its targets, refreshed on its own slow schedule: measured against
   * amp.pldyn.net, the `Running`, `AppState` and `Metrics` values did not change
   * once across 30 seconds of polling, while a direct Core/GetStatus on the same
   * instance updated on every 2-second sample. Treat `appState` and `running`
   * here as "the controller's last known view", good enough for a picker label
   * and nothing more.
   *
   * Anywhere the answer actually matters — status readouts, post-action
   * confirmation, readiness polling — go to the proxied Core/GetStatus instead.
   * That is the authoritative source.
   */
  async listInstances( opts: { force?: boolean } = {} ): Promise<AMPInstance[]> {
    const cache = this.instanceCache;
    if ( opts.force !== true && cache != null && Date.now() - cache.at < this.instanceCacheTtlMs ) {
      return cache.items;
    }

    const body = await this.call<unknown>( 'ADSModule/GetInstances' );

    const items = AMPClient.toTargets( body )
      .flatMap( target => target.AvailableInstances ?? [] )
      // The controller lists itself as an instance. Stopping it takes the whole panel offline.
      .filter( raw => raw.InstanceID != null && raw.Module !== 'ADS' )
      .map( raw => AMPClient.toInstance( raw ) )
      .sort( ( a, b ) => a.friendlyName.localeCompare( b.friendlyName ) );

    this.instanceCache = { at: Date.now(), items };
    return items;
  }

  /** Resolve an instance by id, instance name, or friendly name. */
  async findInstance( idOrName: string ): Promise<AMPInstance | null> {
    const needle = idOrName.trim().toLowerCase();

    const search = ( items: AMPInstance[] ): AMPInstance | null =>
      items.find( i => i.instanceId.toLowerCase() === needle )
      ?? items.find( i => i.instanceName.toLowerCase() === needle )
      ?? items.find( i => i.friendlyName.toLowerCase() === needle )
      ?? null;

    const hit = search( await this.listInstances() );
    if ( hit != null ) return hit;

    // Might have been created since the cache was filled.
    return search( await this.listInstances( { force: true } ) );
  }

  async getInstanceStatus( instance: AMPInstance ): Promise<AMPStatus> {
    const raw = await this.callInstance<RawAMPStatus>( instance, 'Core', 'GetStatus' );

    return {
      state: raw.State ?? -1,
      uptime: raw.Uptime ?? '',
      metrics: AMPClient.toMetrics( raw.Metrics )
    };
  }

  // -- Instance control (the AMP daemon) ------------------------------------
  //
  // AMP has two independently controllable layers, and conflating them does not
  // work: an instance whose daemon is down cannot be reached through the proxy
  // at all, so the *only* way to bring it up is to ask the controller. These
  // two methods operate on the daemon; startApplication/stopApplication below
  // operate on the game server running inside it.
  //
  // Starting an instance deliberately does NOT start its application. That is
  // how these instances are configured, and it is the intended behaviour —
  // bringing a machine up is not the same as putting it into service.

  /**
   * Bring an instance's daemon up via the controller.
   *
   * Keyed on `InstanceName` (the internal short name, e.g. `PlDynEmpyrion01`),
   * not the GUID — verified against the live controller, which answers
   * "No such instance with this name" for a GUID. This is why the method takes
   * the whole DTO rather than an id.
   */
  async startInstance( instance: AMPInstance ): Promise<AMPActionResult> {
    if ( instance.suspended ) {
      throw new AMPError( 'rejected',
        `${ instance.friendlyName } is suspended in AMP; it will accept a start command and do nothing.` );
    }

    await this.call<unknown>( 'ADSModule/StartInstance', { InstanceName: instance.instanceName } );
    this.invalidateInstanceCache();
    // Any session we held for a previous life of this instance is dead.
    this.instanceSessions.delete( instance.instanceId );
    return { accepted: true };
  }

  /**
   * Is the instance reachable through the proxy right now, and if so what is
   * its application doing?
   *
   * This is the honest readiness signal. The controller's `Running` flag lags
   * reality by tens of seconds, but the proxy either answers or it does not:
   * `unavailable` means the daemon is genuinely down, and any successful
   * response means it is genuinely up *and* carries the true application state.
   */
  async probeInstance( instance: AMPInstance ): Promise<AMPStatus | null> {
    try {
      return await this.getInstanceStatus( instance );
    }
    catch ( err ) {
      if ( err instanceof AMPError && err.kind === 'unavailable' ) return null;
      throw err;
    }
  }

  /** Take an instance's daemon down via the controller. */
  async stopInstance( instance: AMPInstance ): Promise<AMPActionResult> {
    await this.call<unknown>( 'ADSModule/StopInstance', { InstanceName: instance.instanceName } );
    this.invalidateInstanceCache();
    this.instanceSessions.delete( instance.instanceId );
    return { accepted: true };
  }

  // -- Application control (the game server inside the instance) -------------

  /**
   * Start the application inside a running instance.
   *
   * Requires the daemon to be up; there is no proxy route to an instance that
   * is not running, and AMP answers "Instance Unavailable" if you try.
   */
  async startApplication( instance: AMPInstance ): Promise<AMPActionResult> {
    await this.callInstance<unknown>( instance, 'Core', 'Start' );
    this.invalidateInstanceCache();
    return { accepted: true };
  }

  /**
   * Stop the application inside a running instance. Core/Stop returns Void, so
   * the absence of an error means *accepted*, not stopped — poll for the rest.
   */
  async stopApplication( instance: AMPInstance ): Promise<AMPActionResult> {
    await this.callInstance<unknown>( instance, 'Core', 'Stop' );
    this.invalidateInstanceCache();
    return { accepted: true };
  }

  // -- Mapping --------------------------------------------------------------

  private static toTargets( body: unknown ): RawAMPTarget[] {
    if ( Array.isArray( body ) ) return body as RawAMPTarget[];

    if ( body != null && typeof body === 'object' ) {
      const wrapped = ( body as { result?: unknown } ).result;
      if ( Array.isArray( wrapped ) ) return wrapped as RawAMPTarget[];
    }

    return [];
  }

  private static toMetrics( raw: Record<string, RawAMPMetric> | undefined ): Record<string, AMPMetric> {
    const out: Record<string, AMPMetric> = {};
    if ( raw == null ) return out;

    for ( const [name, metric] of Object.entries( raw ) ) {
      out[name] = {
        rawValue: metric.RawValue ?? 0,
        maxValue: metric.MaxValue ?? 0,
        percent: metric.Percent ?? 0,
        units: metric.Units ?? '',
        shortName: metric.ShortName
      };
    }

    return out;
  }

  private static toInstance( raw: RawAMPInstance ): AMPInstance {
    const endpoints: AMPEndpoint[] = ( raw.ApplicationEndpoints ?? [] ).map( e => ( {
      displayName: e.DisplayName ?? '',
      endpoint: e.Endpoint ?? ''
    } ) );

    const instanceName = raw.InstanceName ?? '';

    return {
      instanceId: raw.InstanceID ?? '',
      instanceName,
      friendlyName: raw.FriendlyName ?? instanceName,
      targetId: raw.TargetID,
      module: raw.Module ?? '',
      moduleDisplayName: raw.ModuleDisplayName ?? raw.Module ?? '',
      description: raw.Description,
      running: raw.Running ?? false,
      appState: raw.AppState ?? -1,
      suspended: raw.Suspended ?? false,
      ip: raw.IP,
      port: raw.Port,
      isHttps: raw.IsHTTPS ?? false,
      diskUsageMB: raw.DiskUsageMB,
      metrics: AMPClient.toMetrics( raw.Metrics ),
      endpoints,
      tags: raw.Tags ?? []
    };
  }
}

export default AMPClient;
