import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
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
  isHttps: false,
  metrics: {},
  endpoints: [],
  tags: []
};

let fetchMock: ReturnType<typeof vi.fn>;

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
  fetchMock = vi.fn();
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
      .mockResolvedValueOnce( res( LOGIN_OK ) )
      .mockResolvedValueOnce( res( UNAUTHORIZED ) )                                    // ADS session refused
      .mockResolvedValueOnce( res( INSTANCE_LOGIN_OK ) )                               // per-instance login
      .mockResolvedValueOnce( res( { State: 20, Uptime: '01:00:00', Metrics: {} } ) )  // status
      .mockResolvedValueOnce( res( { Status: true } ) )                                // StartInstance
      .mockResolvedValueOnce( res( UNAUTHORIZED ) )                                    // ADS session refused again
      .mockResolvedValueOnce( res( INSTANCE_LOGIN_OK ) )                               // fresh login, not the stale one
      .mockResolvedValueOnce( res( { State: 0, Uptime: '00:00:00', Metrics: {} } ) );

    const amp = makeClient();
    await amp.getInstanceStatus( INSTANCE );
    await amp.startInstance( INSTANCE );
    await amp.getInstanceStatus( INSTANCE );

    // A session cached from the instance's previous life would have skipped the
    // re-login and been rejected.
    expect( urlOf( 7 ) ).toBe( 'https://amp.test/API/ADSModule/Servers/abc-123/API/Core/Login' );
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
      instanceId: 'm-1', instanceName: 'MC01', appState: 20, running: true, port: 25565, ip: '10.0.0.120'
    } );
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
