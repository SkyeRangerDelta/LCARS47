import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type PocketBase from 'pocketbase';
import { beszel_ensureAuth, beszel_tokenExpiry } from './Beszel_Connect.js';

/** Build a JWT-shaped token whose exp claim is `hours` from now. */
function tokenExpiringIn( hours: number ): string {
  const claims = Buffer.from( JSON.stringify( {
    id: 'abc', type: 'auth', refreshable: true,
    exp: Math.floor( ( Date.now() + hours * 3_600_000 ) / 1000 )
  } ) ).toString( 'base64url' );

  return `header.${ claims }.signature`;
}

interface StubPB {
  authStore: { token: string; isValid: boolean };
  authRefresh: ReturnType<typeof vi.fn>;
  authWithPassword: ReturnType<typeof vi.fn>;
}

function makeStub( token: string, isValid = true ): StubPB & PocketBase {
  const stub: StubPB = {
    authStore: { token, isValid },
    authRefresh: vi.fn().mockResolvedValue( undefined ),
    authWithPassword: vi.fn().mockResolvedValue( undefined )
  };

  // collection() returns the same object so the test can assert on the calls.
  ( stub as unknown as { collection: () => StubPB } ).collection = () => stub;

  return stub as unknown as StubPB & PocketBase;
}

beforeAll( () => {
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'warn' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'error' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

beforeEach( () => {
  vi.clearAllMocks();
} );

describe( 'beszel_tokenExpiry', () => {
  it( 'reads the exp claim out of the token', () => {
    const expiry = beszel_tokenExpiry( makeStub( tokenExpiringIn( 24 ) ) );

    expect( expiry ).not.toBeNull();
    // Beszel issues 24h superuser tokens; allow a second of clock slop.
    expect( ( expiry! - Date.now() ) / 3_600_000 ).toBeCloseTo( 24, 1 );
  } );

  it( 'returns null when there is no token', () => {
    expect( beszel_tokenExpiry( makeStub( '' ) ) ).toBeNull();
  } );

  it( 'returns null rather than throwing on a malformed token', () => {
    expect( beszel_tokenExpiry( makeStub( 'not-a-jwt' ) ) ).toBeNull();
    expect( beszel_tokenExpiry( makeStub( 'a.!!!not-base64!!!.c' ) ) ).toBeNull();
  } );
} );

describe( 'beszel_ensureAuth', () => {
  it( 'does nothing while the token has plenty of life left', async () => {
    const pb = makeStub( tokenExpiringIn( 20 ) );

    await beszel_ensureAuth( pb );

    expect( pb.authRefresh ).not.toHaveBeenCalled();
    expect( pb.authWithPassword ).not.toHaveBeenCalled();
  } );

  it( 'renews once the token nears expiry', async () => {
    // Inside the two-hour margin.
    const pb = makeStub( tokenExpiringIn( 1 ) );

    await beszel_ensureAuth( pb );

    expect( pb.authRefresh ).toHaveBeenCalledTimes( 1 );
    expect( pb.authWithPassword ).not.toHaveBeenCalled();
  } );

  it( 'renews an already-expired session', async () => {
    const pb = makeStub( tokenExpiringIn( -1 ), false );

    await beszel_ensureAuth( pb );

    expect( pb.authRefresh ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'falls back to a credential login when the refresh is rejected', async () => {
    const pb = makeStub( tokenExpiringIn( -1 ), false );
    pb.authRefresh.mockRejectedValueOnce( new Error( 'token is expired' ) );

    await beszel_ensureAuth( pb );

    expect( pb.authRefresh ).toHaveBeenCalledTimes( 1 );
    expect( pb.authWithPassword ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'does not storm the server when called repeatedly', async () => {
    // A pathologically short token would otherwise turn every Beszel read into
    // a refresh.
    const pb = makeStub( tokenExpiringIn( 0.01 ) );

    await beszel_ensureAuth( pb );
    await beszel_ensureAuth( pb );
    await beszel_ensureAuth( pb );

    expect( pb.authRefresh ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'throttles each client independently', async () => {
    const first = makeStub( tokenExpiringIn( 0.5 ) );
    const second = makeStub( tokenExpiringIn( 0.5 ) );

    await beszel_ensureAuth( first );
    await beszel_ensureAuth( second );

    expect( first.authRefresh ).toHaveBeenCalledTimes( 1 );
    expect( second.authRefresh ).toHaveBeenCalledTimes( 1 );
  } );
} );
