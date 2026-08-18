import { describe, it, expect, beforeEach, beforeAll, afterAll, vi, type Mock } from 'vitest';
import { AMPClient, type AMPClientConfig } from './AMPClient.js';
import type { AMPInstance } from './AMPInterfaces.js';

// -- Fixtures ---------------------------------------------------------------

/** AMP answers 200 for everything, so the fake never varies the status unless asked. */
const res = ( body: unknown, status = 200 ): Response => ( {
  ok: status < 400,
  status,
  text: async (): Promise<string> => await Promise.resolve( body === undefined ? '' : JSON.stringify( body ) )
} as unknown as Response );

const rawRes = ( text: string, status = 200 ): Response => ( {
  ok: status < 400,
  status,
  text: async (): Promise<string> => await Promise.resolve( text )
} as unknown as Response );

const LOGIN_OK = { success: true, sessionID: 'sess-1', rememberMeToken: 'rmt-1', permissions: ['Core.AppManagement.StartApplication'] };
const INSTANCE_LOGIN_OK = { success: true, sessionID: 'inst-1', rememberMeToken: '', permissions: [] };

const UNAUTHORIZED = {
  Title: 'Unauthorized Access',
  Message: 'You do not have permission to use this method (GSMyAdmin.WebServer.GetStatus) at this time. This method requires the Session.Exists permission.',
  StackTrace: ''
};

const INSTANCE: AMPInstance = {
  instanceId: 'abc-123',
  instanceName: 'MC01',
  friendlyName: 'Minecraft',
  module: 'MinecraftModule',
  moduleDisplayName: 'Minecraft',
  running: true,
  appState: 20,
  suspended: false,
  metrics: {},
  tags: []
};

/** Typed so mockImplementation can legitimately return a promise. */
type FetchStub = ( url: string, init: unknown ) => Promise<Response>;

let fetchMock: Mock<FetchStub>;

function makeClient( over: Partial<AMPClientConfig> = {} ): AMPClient {
  return new AMPClient( {
    baseUrl: 'amp.test',
    username: 'u',
    password: 'p',
    fetchImpl: fetchMock as unknown as typeof fetch,
    ...over
  } );
}

/** The URL of the nth fetch call (1-indexed). */
function urlOf( n: number ): string {
  return String( fetchMock.mock.calls[n - 1][0] );
}

/** The parsed JSON body of the nth fetch call (1-indexed). */
function bodyOf( n: number ): Record<string, unknown> {
  const init = fetchMock.mock.calls[n - 1][1] as { body: string };
  return JSON.parse( init.body ) as Record<string, unknown>;
}

beforeAll( () => {
  // Utility.log writes straight to the console; keep the test output readable.
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'warn' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'error' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

beforeEach( () => {
  fetchMock = vi.fn<FetchStub>();
} );

// -- Tests ------------------------------------------------------------------

describe( 'AMPClient.normaliseBaseUrl', () => {
  it( 'defaults a scheme-less host to https', () => {
    expect( AMPClient.normaliseBaseUrl( 'amp.pldyn.net' ) ).toBe( 'https://amp.pldyn.net' );
  } );

  it( 'trims trailing slashes', () => {
    expect( AMPClient.normaliseBaseUrl( 'https://amp.pldyn.net/' ) ).toBe( 'https://amp.pldyn.net' );
  } );

  it( 'strips a trailing /API pasted from the docs', () => {
    expect( AMPClient.normaliseBaseUrl( 'https://amp.pldyn.net/API/' ) ).toBe( 'https://amp.pldyn.net' );
  } );

  it( 'preserves an explicit scheme and port', () => {
    expect( AMPClient.normaliseBaseUrl( 'http://impulse.local:8080' ) ).toBe( 'http://impulse.local:8080' );
  } );
} );

describe( 'AMPClient request shape', () => {
  it( 'posts JSON to /API/<path> with the session in the body', async () => {
    fetchMock.mockResolvedValueOnce( res( LOGIN_OK ) );

    const amp = makeClient();
    await amp.authenticate();

    expect( urlOf( 1 ) ).toBe( 'https://amp.test/API/Core/Login' );

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect( init.method ).toBe( 'POST' );
    expect( ( init.headers as Record<string, string> ).Accept ).toBe( 'text/javascript' );
    expect( bodyOf( 1 ) ).toMatchObject( { username: 'u', password: 'p', rememberMe: true, SESSIONID: '' } );

    expect( amp.isReady() ).toBe( true );
    expect( amp.getPermissions() ).toContain( 'Core.AppManagement.StartApplication' );
  } );

  it( 'sends the stored session on subsequent calls', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( [] ) );

    await makeClient().listInstances();

    expect( bodyOf( 2 ) ).toMatchObject( { SESSIONID: 'sess-1' } );
  } );
} );

describe( 'AMPClient error detection', () => {
  it( 'rejects a fault body even though the response is 200 OK', async () => {
    // getInstanceStatus has no ADS-level action fallback, so once both the
    // controller session and the per-instance login are refused the error
    // reaches the caller intact.
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( UNAUTHORIZED ) )   // proxied call refused
      .mockResolvedValueOnce( res( UNAUTHORIZED ) );  // per-instance login refused too

    await expect( makeClient().getInstanceStatus( INSTANCE ) )
      .rejects.toMatchObject( { name: 'AMPError', kind: 'unauthorized' } );
  } );

  it( 'classifies a missing instance as not-found', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { Status: false, Reason: 'No instance with ID abc-123 exists.' } ) );

    await expect( makeClient().getInstanceStatus( INSTANCE ) )
      .rejects.toMatchObject( { kind: 'not-found' } );
  } );

  it( 'classifies a stopped instance as unavailable, not a generic refusal', async () => {
    // Captured verbatim from amp.pldyn.net for an instance whose daemon is down.
    // Every proxied call answers this, including the per-instance Core/Login.
    const unavailable = {
      Title: 'Instance Unavailable',
      Message: 'The requested instance is not available at this time.',
      StackTrace: null
    };

    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( unavailable ) );

    await expect( makeClient().getInstanceStatus( INSTANCE ) )
      .rejects.toMatchObject( { kind: 'unavailable' } );
  } );

  it( 'classifies a plain refusal as rejected', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { Status: false, Reason: 'Nope' } ) );

    await expect( makeClient().getInstanceStatus( INSTANCE ) )
      .rejects.toMatchObject( { kind: 'rejected', message: 'Nope' } );
  } );

  it( 'treats { Status: true } as success, not failure', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { Status: true } ) );

    await expect( makeClient().startInstance( INSTANCE ) ).resolves.toEqual( { accepted: true } );
  } );

  it( 'classifies the ADS-level "no such instance" wording as not-found', async () => {
    // Captured verbatim from amp.pldyn.net. Different wording to the proxy
    // router's "No instance with ID ... exists.", same meaning.
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { Status: false, Reason: 'No such instance with this name' } ) );

    await expect( makeClient().startInstance( INSTANCE ) )
      .rejects.toMatchObject( { kind: 'not-found' } );
  } );

  it( 'classifies a non-JSON body as malformed', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( rawRes( '<html>502 Bad Gateway</html>' ) );

    await expect( makeClient().getInstanceStatus( INSTANCE ) )
      .rejects.toMatchObject( { kind: 'malformed' } );
  } );

  it( 'classifies a genuine non-2xx as http', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( {}, 504 ) );

    await expect( makeClient().getInstanceStatus( INSTANCE ) )
      .rejects.toMatchObject( { kind: 'http' } );
  } );

  it( 'classifies an aborted request as timeout', async () => {
    fetchMock.mockRejectedValueOnce( Object.assign( new Error( 'aborted' ), { name: 'AbortError' } ) );

    await expect( makeClient().authenticate() ).rejects.toMatchObject( { kind: 'timeout' } );
  } );

  it( 'classifies a transport failure as network and keeps the cause code', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign( new TypeError( 'fetch failed' ), { cause: { code: 'CERT_HAS_EXPIRED' } } )
    );

    await expect( makeClient().authenticate() )
      .rejects.toMatchObject( { kind: 'network', detail: 'CERT_HAS_EXPIRED' } );
  } );

  it( 'reports a failed login as auth-failed', async () => {
    fetchMock.mockResolvedValueOnce( res( { success: false, resultReason: 'Incorrect username or password.' } ) );

    await expect( makeClient().authenticate() )
      .rejects.toMatchObject( { kind: 'auth-failed', message: 'Incorrect username or password.' } );
  } );

  it( 'treats the null-session sentinel as an auth failure', async () => {
    fetchMock.mockResolvedValueOnce( res( { success: true, sessionID: '00000000-0000-0000-0000-000000000000' } ) );

    await expect( makeClient().authenticate() ).rejects.toMatchObject( { kind: 'auth-failed' } );
  } );

  it( 'gives an actionable message when the account has 2FA', async () => {
    fetchMock.mockResolvedValueOnce( res( { success: false, resultReason: 'A two-factor token is required.' } ) );

    await expect( makeClient().authenticate() ).rejects.toThrow( /without 2FA/i );
  } );
} );

describe( 'AMPClient empty-body handling', () => {
  it( 'accepts the empty 200 body Core/Stop returns instead of throwing a parse error', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( undefined ) ); // Void — empty body

    await expect( makeClient().stopApplication( INSTANCE ) ).resolves.toEqual( { accepted: true } );
  } );
} );

describe( 'AMPClient control layers', () => {
  // AMP's instance daemon and the application inside it are separately
  // controlled, and the two use entirely different routes. Mixing them up is
  // the difference between /amp working and not working for an offline server.

  it( 'drives instance control through the controller, keyed on InstanceName', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { Status: true } ) );

    await makeClient().startInstance( INSTANCE );

    expect( urlOf( 2 ) ).toBe( 'https://amp.test/API/ADSModule/StartInstance' );
    // Verified against the live controller: a GUID here answers
    // "No such instance with this name" — it resolves by the short name.
    expect( bodyOf( 2 ) ).toMatchObject( { InstanceName: 'MC01' } );
  } );

  it( 'drives instance stop through the controller too', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { Status: true } ) );

    await makeClient().stopInstance( INSTANCE );

    expect( urlOf( 2 ) ).toBe( 'https://amp.test/API/ADSModule/StopInstance' );
  } );

  it( 'drives application control through the instance proxy', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { Status: true } ) );

    await makeClient().startApplication( INSTANCE );

    expect( urlOf( 2 ) ).toBe( 'https://amp.test/API/ADSModule/Servers/abc-123/API/Core/Start' );
  } );

  it( 'does not silently fall back from one layer to the other', async () => {
    // An offline instance answers "Instance Unavailable" to proxied calls.
    // Starting the application must surface that rather than quietly issuing an
    // ADS-level instance start the operator did not ask for.
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( {
        Title: 'Instance Unavailable',
        Message: 'The requested instance is not available at this time.',
        StackTrace: null
      } ) );

    await expect( makeClient().startApplication( INSTANCE ) )
      .rejects.toMatchObject( { kind: 'unavailable' } );

    expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    expect( fetchMock.mock.calls.some( c => String( c[0] ).includes( 'ADSModule/StartInstance' ) ) ).toBe( false );
  } );

  it( 'refuses to start a suspended instance', async () => {
    const amp = makeClient();
    await expect( amp.startInstance( { ...INSTANCE, suspended: true } ) ).rejects.toThrow( /suspended/i );
    expect( fetchMock ).not.toHaveBeenCalled();
  } );
} );

describe( 'AMPClient action locking', () => {
  // AMP accepts a control action immediately and works on it in the background,
  // so the command that issued it polls for ~30s afterwards. The lock has to
  // cover that whole window, not just the API call.

  const never = async (): Promise<never> => await new Promise( () => { /* held open */ } );

  it( 'refuses a second action while one is running', async () => {
    const amp = makeClient();

    void amp.withInstanceLock( INSTANCE, 'being started by Skye', never );
    await Promise.resolve();

    await expect( amp.withInstanceLock( INSTANCE, 'being stopped by Someone', never ) )
      .rejects.toMatchObject( { kind: 'busy' } );
  } );

  it( 'names the instance and the holder in the refusal', async () => {
    const amp = makeClient();

    void amp.withInstanceLock( INSTANCE, 'being started by Skye', never );
    await Promise.resolve();

    await expect( amp.withInstanceLock( INSTANCE, 'x', never ) )
      .rejects.toThrow( 'Minecraft is already being started by Skye.' );
  } );

  it( 'holds across the whole operation, not just the first call', async () => {
    const amp = makeClient();
    let release: () => void = () => undefined;
    const gate = new Promise<void>( r => { release = r; } );

    const running = amp.withInstanceLock( INSTANCE, 'being started by Skye', async () => await gate );
    await Promise.resolve();

    // Mid-poll: still locked.
    await expect( amp.withInstanceLock( INSTANCE, 'x', never ) ).rejects.toMatchObject( { kind: 'busy' } );

    release();
    await running;

    // Released once the operation finishes.
    await expect( amp.withInstanceLock( INSTANCE, 'y', () => Promise.resolve( 'ok' ) ) ).resolves.toBe( 'ok' );
  } );

  it( 'releases the lock even when the operation throws', async () => {
    const amp = makeClient();

    await expect( amp.withInstanceLock( INSTANCE, 'x', async () => {
      await Promise.resolve();
      throw new Error( 'boom' );
    } ) ).rejects.toThrow( 'boom' );

    expect( amp.busyWith( INSTANCE ) ).toBeNull();
    await expect( amp.withInstanceLock( INSTANCE, 'y', () => Promise.resolve( 'ok' ) ) ).resolves.toBe( 'ok' );
  } );

  it( 'locks per instance, not globally', async () => {
    const amp = makeClient();
    const other = { ...INSTANCE, instanceId: 'def-456', friendlyName: 'Valheim' };

    void amp.withInstanceLock( INSTANCE, 'being started by Skye', never );
    await Promise.resolve();

    await expect( amp.withInstanceLock( other, 'being started by Skye', () => Promise.resolve( 'ok' ) ) )
      .resolves.toBe( 'ok' );
  } );

  it( 'reports what is holding an instance', async () => {
    const amp = makeClient();

    expect( amp.busyWith( INSTANCE ) ).toBeNull();

    void amp.withInstanceLock( INSTANCE, 'being stopped by Skye', never );
    await Promise.resolve();

    expect( amp.busyWith( INSTANCE ) ).toBe( 'being stopped by Skye' );
  } );
} );

describe( 'AMPClient login restraint', () => {
  // On a controller where the ADS session does not proxy, every instance needs
  // its own login. A fan-out like /amp list hydrating several servers at once
  // therefore fires several simultaneous logins, which AMP's brute-force
  // protection treats as an attack.

  const RATE_LIMITED = {
    success: false,
    resultReason: 'The auth server at https://amp.pldyn.net/ is not accepting login requests from you at this time. Please wait several minutes before trying again.'
  };

  const statusOk = { State: 20, Uptime: '01:00:00', Metrics: {} };

  function instance( id: string ): AMPInstance {
    return { ...INSTANCE, instanceId: id, instanceName: id.toUpperCase(), friendlyName: id };
  }

  // The controller login and a per-instance login both end in /API/Core/Login;
  // only the /Servers/ segment tells them apart.
  const isAdsLogin = ( u: string ): boolean => u === 'https://amp.test/API/Core/Login';
  const isInstanceLogin = ( u: string ): boolean => u.includes( '/Servers/' ) && u.endsWith( '/Core/Login' );
  const sessionOf = ( init: unknown ): string =>
    ( JSON.parse( ( init as { body: string } ).body ) as { SESSIONID: string } ).SESSIONID;

  const countInstanceLogins = (): number =>
    fetchMock.mock.calls.filter( c => isInstanceLogin( String( c[0] ) ) ).length;

  it( 'shares one login between concurrent probes of the same instance', async () => {
    fetchMock.mockImplementation( async ( url: string, init: unknown ): Promise<Response> => {
      await Promise.resolve();
      if ( isAdsLogin( url ) ) return res( LOGIN_OK );
      if ( isInstanceLogin( url ) ) return res( INSTANCE_LOGIN_OK );
      // Only the per-instance session is accepted through the proxy.
      return res( sessionOf( init ) === 'inst-1' ? statusOk : UNAUTHORIZED );
    } );

    const amp = makeClient();

    await Promise.all( [
      amp.probeInstance( INSTANCE ),
      amp.probeInstance( INSTANCE )
    ] );

    expect( countInstanceLogins() ).toBe( 1 );
  } );

  it( 'does not fire logins for different instances simultaneously', async () => {
    let concurrent = 0;
    let peak = 0;

    fetchMock.mockImplementation( async ( url: string, init: unknown ): Promise<Response> => {
      if ( isAdsLogin( url ) ) return res( LOGIN_OK );

      if ( isInstanceLogin( url ) ) {
        concurrent++;
        peak = Math.max( peak, concurrent );
        await new Promise( r => setTimeout( r, 5 ) );
        concurrent--;
        return res( INSTANCE_LOGIN_OK );
      }

      return res( sessionOf( init ) === 'inst-1' ? statusOk : UNAUTHORIZED );
    } );

    const amp = makeClient();
    await amp.authenticate();

    await Promise.all( ['a', 'b', 'c', 'd'].map( async id => await amp.probeInstance( instance( id ) ) ) );

    // Four instances, four logins — but never two at once. The simultaneous
    // burst is what AMP's brute-force protection reacted to.
    expect( countInstanceLogins() ).toBe( 4 );
    expect( peak ).toBe( 1 );
  } );

  it( 'classifies AMP throttling as rate-limited rather than a bad password', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( UNAUTHORIZED ) )
      .mockResolvedValueOnce( res( RATE_LIMITED ) );

    await expect( makeClient().getInstanceStatus( INSTANCE ) )
      .rejects.toMatchObject( { kind: 'rate-limited' } );
  } );

  it( 'stops attempting logins once throttled, instead of making it worse', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( UNAUTHORIZED ) )
      .mockResolvedValueOnce( res( RATE_LIMITED ) );

    const amp = makeClient();
    await expect( amp.getInstanceStatus( INSTANCE ) ).rejects.toMatchObject( { kind: 'rate-limited' } );

    const callsAfterThrottle = fetchMock.mock.calls.length;
    fetchMock.mockResolvedValue( res( UNAUTHORIZED ) );

    // A second attempt should fail from the cooldown without another login.
    await expect( amp.getInstanceStatus( instance( 'other' ) ) )
      .rejects.toMatchObject( { kind: 'rate-limited' } );

    const logins = fetchMock.mock.calls
      .slice( callsAfterThrottle )
      .filter( c => String( c[0] ).endsWith( '/Core/Login' ) );

    expect( logins ).toHaveLength( 0 );
  } );

  it( 'reuses a per-instance session well past the controller session TTL', async () => {
    // Short instance TTLs meant re-logging in to every instance every few
    // minutes, which is what caused the throttle in the first place.
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( UNAUTHORIZED ) )
      .mockResolvedValueOnce( res( INSTANCE_LOGIN_OK ) )
      .mockResolvedValue( res( statusOk ) );

    const amp = makeClient( { sessionTtlMs: 0 } );
    await amp.getInstanceStatus( INSTANCE );

    const before = fetchMock.mock.calls.length;
    await amp.getInstanceStatus( INSTANCE );

    const logins = fetchMock.mock.calls
      .slice( before )
      .filter( c => String( c[0] ).endsWith( '/Core/Login' ) );

    expect( logins ).toHaveLength( 0 );
  } );
} );

describe( 'AMPClient observed-state overlay', () => {
  // The controller's aggregate lags by tens of seconds, so anything learned by
  // asking an instance directly has to outrank it — otherwise a list read
  // straight after a control action still shows the pre-action state.

  const targets = [ { AvailableInstances: [
    { InstanceID: 'abc-123', InstanceName: 'MC01', FriendlyName: 'Minecraft',
      Module: 'MinecraftModule', Running: false, AppState: -1 }
  ] } ];

  it( 'lets a direct observation override a stale aggregate', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { State: 20, Uptime: '01:00:00', Metrics: {} } ) )  // probe says up
      .mockResolvedValue( res( targets ) );                                            // aggregate says down

    const amp = makeClient();
    await amp.probeInstance( INSTANCE );

    const [listed] = await amp.listInstances( { force: true } );

    expect( listed.running ).toBe( true );
    expect( listed.appState ).toBe( 20 );
  } );

  it( 'records an unreachable instance as offline', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( {
        Title: 'Instance Unavailable',
        Message: 'The requested instance is not available at this time.',
        StackTrace: null
      } ) )
      .mockResolvedValue( res( [ { AvailableInstances: [
        { InstanceID: 'abc-123', InstanceName: 'MC01', FriendlyName: 'Minecraft',
          Module: 'MinecraftModule', Running: true, AppState: 20 }
      ] } ] ) );

    const amp = makeClient();
    await amp.probeInstance( INSTANCE );

    const [listed] = await amp.listInstances( { force: true } );

    expect( listed.running ).toBe( false );
  } );

  it( 'leaves instances it has never probed alone', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValue( res( targets ) );

    const [listed] = await makeClient().listInstances();

    expect( listed.running ).toBe( false );
    expect( listed.appState ).toBe( -1 );
  } );
} );

describe( 'AMPClient.probeInstance', () => {
  // The controller's Running flag lags reality by tens of seconds, so readiness
  // is decided by whether the proxy answers, not by what the aggregate claims.

  it( 'returns null when the daemon is down rather than throwing', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( {
        Title: 'Instance Unavailable',
        Message: 'The requested instance is not available at this time.',
        StackTrace: null
      } ) );

    await expect( makeClient().probeInstance( INSTANCE ) ).resolves.toBeNull();
  } );

  it( 'returns the live status when the daemon is up', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { State: 0, Uptime: '00:00:00', Metrics: {} } ) );

    await expect( makeClient().probeInstance( INSTANCE ) )
      .resolves.toMatchObject( { state: 0 } );
  } );

  it( 'still surfaces genuine failures', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( {}, 504 ) );

    await expect( makeClient().probeInstance( INSTANCE ) )
      .rejects.toMatchObject( { kind: 'http' } );
  } );

  it( 'drops a cached proxy session when the instance is restarted', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )                                        // 1 controller login
      .mockResolvedValueOnce( res( UNAUTHORIZED ) )                                    // 2 ADS session refused
      .mockResolvedValueOnce( res( INSTANCE_LOGIN_OK ) )                               // 3 per-instance login
      .mockResolvedValueOnce( res( { State: 20, Uptime: '01:00:00', Metrics: {} } ) )  // 4 status
      .mockResolvedValueOnce( res( { Status: true } ) )                                // 5 StartInstance
      .mockResolvedValueOnce( res( INSTANCE_LOGIN_OK ) )                               // 6 fresh login
      .mockResolvedValueOnce( res( { State: 0, Uptime: '00:00:00', Metrics: {} } ) );  // 7 status

    const amp = makeClient();
    await amp.getInstanceStatus( INSTANCE );
    await amp.startInstance( INSTANCE );
    await amp.getInstanceStatus( INSTANCE );

    // A session cached from the instance's previous life would have skipped the
    // re-login and been rejected.
    expect( urlOf( 6 ) ).toBe( 'https://amp.test/API/ADSModule/Servers/abc-123/API/Core/Login' );

    // And having already learned this instance needs its own session, the
    // controller session is not re-tried on the way — that request is pure
    // waste against a server known to refuse it.
    expect( fetchMock ).toHaveBeenCalledTimes( 7 );
  } );

  it( 'announces the proxy auth mode once per instance, not once per renewal', async () => {
    const logged: string[] = [];
    const spy = vi.spyOn( console, 'info' ).mockImplementation( ( msg: unknown ) => {
      logged.push( String( msg ) );
    } );

    fetchMock.mockImplementation( async ( url: string, init: unknown ): Promise<Response> => {
      await Promise.resolve();
      const session = ( JSON.parse( ( init as { body: string } ).body ) as { SESSIONID: string } ).SESSIONID;

      if ( url === 'https://amp.test/API/Core/Login' ) return res( LOGIN_OK );
      if ( url.endsWith( '/Core/Login' ) ) return res( INSTANCE_LOGIN_OK );
      // The instance session is accepted exactly once, then goes stale — the
      // shape that was producing a log line on every single transaction.
      if ( session === 'inst-1' && !expired ) { expired = true; return res( { State: 20, Uptime: '1:00:00', Metrics: {} } ); }
      return res( UNAUTHORIZED );
    } );

    let expired = false;
    const amp = makeClient();

    await amp.getInstanceStatus( INSTANCE );
    expired = false;
    await amp.getInstanceStatus( INSTANCE );
    expired = false;
    await amp.getInstanceStatus( INSTANCE );

    const announcements = logged.filter( l => l.includes( 'does not proxy' ) );
    expect( announcements ).toHaveLength( 1 );

    spy.mockRestore();
  } );
} );

describe( 'AMPClient session lifecycle', () => {
  it( 'reuses the session across calls inside the TTL', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValue( res( [] ) );

    const amp = makeClient();
    await amp.listInstances( { force: true } );
    await amp.listInstances( { force: true } );

    const logins = fetchMock.mock.calls.filter( c => String( c[0] ).endsWith( '/Core/Login' ) );
    expect( logins ).toHaveLength( 1 );
    expect( fetchMock ).toHaveBeenCalledTimes( 3 );
  } );

  it( 'logs in again once the session TTL has lapsed', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( [] ) )
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( [] ) );

    // -1 rather than 0: with a 0 TTL the comparison is `0 > 0` when the clock
    // has not ticked between calls, which makes the test clock-dependent.
    const amp = makeClient( { sessionTtlMs: -1 } );
    await amp.listInstances( { force: true } );
    await amp.listInstances( { force: true } );

    const logins = fetchMock.mock.calls.filter( c => String( c[0] ).endsWith( '/Core/Login' ) );
    expect( logins ).toHaveLength( 2 );
  } );

  it( 'collapses concurrent logins into a single request', async () => {
    fetchMock.mockResolvedValue( res( LOGIN_OK ) );

    const amp = makeClient();
    await Promise.all( [amp.authenticate(), amp.authenticate(), amp.authenticate()] );

    expect( fetchMock ).toHaveBeenCalledTimes( 1 );
  } );

  it( 're-authenticates once when AMP rejects the session mid-flight, without looping', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( UNAUTHORIZED ) )
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( [] ) );

    await expect( makeClient().listInstances() ).resolves.toEqual( [] );
    expect( fetchMock ).toHaveBeenCalledTimes( 4 );
  } );

  it( 'retries a stale remember-me token with the password', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { success: false, resultReason: 'Invalid token.' } ) )
      .mockResolvedValueOnce( res( LOGIN_OK ) );

    const amp = makeClient();
    await amp.authenticate();
    await amp.authenticate( true );

    expect( fetchMock ).toHaveBeenCalledTimes( 3 );
    expect( bodyOf( 2 ) ).toMatchObject( { token: 'rmt-1' } );
    expect( bodyOf( 3 ) ).toMatchObject( { token: '' } );
  } );
} );

describe( 'AMPClient instance proxying', () => {
  const proxyPath = 'https://amp.test/API/ADSModule/Servers/abc-123/API/Core/GetStatus';

  it( 'uses the controller session through the proxy when AMP allows it', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { State: 20, Uptime: '01:02:03', Metrics: {} } ) );

    const status = await makeClient().getInstanceStatus( INSTANCE );

    expect( urlOf( 2 ) ).toBe( proxyPath );
    expect( bodyOf( 2 ) ).toMatchObject( { SESSIONID: 'sess-1' } );
    expect( status.state ).toBe( 20 );
  } );

  it( 'falls back to a per-instance login when the controller session is refused', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( UNAUTHORIZED ) )
      .mockResolvedValueOnce( res( INSTANCE_LOGIN_OK ) )
      .mockResolvedValueOnce( res( { State: 20, Uptime: '01:02:03', Metrics: {} } ) );

    const amp = makeClient();
    const status = await amp.getInstanceStatus( INSTANCE );

    expect( urlOf( 3 ) ).toBe( 'https://amp.test/API/ADSModule/Servers/abc-123/API/Core/Login' );
    expect( bodyOf( 3 ) ).toMatchObject( { SESSIONID: '' } );
    expect( bodyOf( 4 ) ).toMatchObject( { SESSIONID: 'inst-1' } );
    expect( status.state ).toBe( 20 );

    // The mode is cached, so the probe is not repeated for this instance.
    fetchMock.mockResolvedValueOnce( res( { State: 20, Uptime: '01:02:03', Metrics: {} } ) );
    await amp.getInstanceStatus( INSTANCE );

    expect( fetchMock ).toHaveBeenCalledTimes( 5 );
    expect( bodyOf( 5 ) ).toMatchObject( { SESSIONID: 'inst-1' } );
  } );

  it( 'maps metrics into DTOs', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( {
        State: 20,
        Uptime: '01:02:03',
        Metrics: { 'CPU Usage': { RawValue: 42, MaxValue: 100, Percent: 42, Units: '%' } }
      } ) );

    const status = await makeClient().getInstanceStatus( INSTANCE );

    expect( status.metrics['CPU Usage'] ).toEqual( {
      rawValue: 42, maxValue: 100, percent: 42, units: '%', shortName: undefined
    } );
  } );

} );

describe( 'AMPClient.listInstances', () => {
  const targets = [
    {
      AvailableInstances: [
        { InstanceID: 'ads-0', InstanceName: 'ADS01', FriendlyName: 'Controller', Module: 'ADS' },
        { InstanceID: 'v-2', InstanceName: 'VS01', FriendlyName: 'Vintage Story', Module: 'GenericModule', Running: false, AppState: 0 }
      ]
    },
    {
      AvailableInstances: [
        { InstanceID: 'm-1', InstanceName: 'MC01', FriendlyName: 'Minecraft', Module: 'MinecraftModule', Running: true, AppState: 20, Port: 25565, IP: '10.0.0.120' }
      ]
    }
  ];

  it( 'flattens targets, drops the controller, and sorts by friendly name', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( targets ) );

    const instances = await makeClient().listInstances();

    expect( instances.map( i => i.friendlyName ) ).toEqual( ['Minecraft', 'Vintage Story'] );
    expect( instances[0] ).toMatchObject( {
      instanceId: 'm-1', instanceName: 'MC01', appState: 20, running: true
    } );

    // Connection details must not survive the mapping — see AMPInstance.
    expect( JSON.stringify( instances ) ).not.toMatch( /10\.0\.0\.120|25565/ );
  } );

  it( 'accepts the { result: [...] } envelope as well as a bare array', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( { result: targets } ) );

    await expect( makeClient().listInstances() ).resolves.toHaveLength( 2 );
  } );

  it( 'serves a second call from cache', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( targets ) );

    const amp = makeClient();
    await amp.listInstances();
    await amp.listInstances();

    expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    expect( amp.instanceCacheAgeMs() ).not.toBeNull();
  } );

  it( 'refetches after invalidateInstanceCache', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValue( res( targets ) );

    const amp = makeClient();
    await amp.listInstances();
    amp.invalidateInstanceCache();
    await amp.listInstances();

    expect( fetchMock ).toHaveBeenCalledTimes( 3 );
    expect( amp.instanceCacheAgeMs() ).not.toBeNull();
  } );

  it( 'refetches when the cache TTL has lapsed', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValue( res( targets ) );

    const amp = makeClient( { instanceCacheTtlMs: -1 } );
    await amp.listInstances();
    await amp.listInstances();

    expect( fetchMock ).toHaveBeenCalledTimes( 3 );
  } );

  it( 'resolves an instance by id, instance name, or friendly name', async () => {
    fetchMock
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValue( res( targets ) );

    const amp = makeClient();

    expect( ( await amp.findInstance( 'm-1' ) )?.friendlyName ).toBe( 'Minecraft' );
    expect( ( await amp.findInstance( 'vs01' ) )?.friendlyName ).toBe( 'Vintage Story' );
    expect( ( await amp.findInstance( 'Minecraft' ) )?.instanceId ).toBe( 'm-1' );
    expect( await amp.findInstance( 'nope' ) ).toBeNull();
  } );
} );
