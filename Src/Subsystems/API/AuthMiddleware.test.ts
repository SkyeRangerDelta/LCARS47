// -- API Authentication Middleware Tests --
// The gate is the whole control for every protected route, so each branch is
// pinned: no header, empty header, wrong token, right token. The 401/403 split
// matters as much as the rejection itself - it is the contract sendMessage has
// always returned and callers distinguish the two.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

// EnvUtils calls process.exit(1) on an incomplete environment and the
// middleware pulls it in at import time. Stub it, matching OpenAPISpec.test.
vi.mock( '../Utilities/EnvUtils', () => ( {
  getEnv: () => ( {
    RDS: 'mongodb://localhost:27017',
    API_HOST: 'localhost',
    API_PORT: '9121',
    API_AUTH_TOKEN: 'test-token'
  } ),
  isFeatureEnabled: () => false,
  default: { getEnv: () => ( {} ), isFeatureEnabled: () => false }
} ) );

import { requireApiAuth } from './AuthMiddleware';
import { API_AUTH_HEADER } from './OpenAPISpec';

/**
 * Minimal express doubles. Only the three members the middleware touches are
 * provided, so a change in what it reaches for fails loudly rather than
 * silently passing against a permissive mock.
 */
function harness( header?: string ) {
  const send = vi.fn();
  const status = vi.fn( () => ( { send } ) );
  const next = vi.fn();

  const readHeader = vi.fn( ( name: string ) => ( name === API_AUTH_HEADER ? header : undefined ) );

  return {
    req: { header: readHeader } as unknown as Request,
    res: { status } as unknown as Response,
    next: next as unknown as NextFunction,
    status,
    send,
    readHeader
  };
}

describe( 'requireApiAuth', () => {
  let h: ReturnType<typeof harness>;

  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'rejects a request carrying no auth header with 401', () => {
    h = harness( undefined );

    requireApiAuth( h.req, h.res, h.next );

    expect( h.status ).toHaveBeenCalledWith( 401 );
    expect( h.send ).toHaveBeenCalledWith(
      { ERROR: true, MESSAGE: 'Unauthorized: Missing authentication header.' }
    );
    expect( h.next ).not.toHaveBeenCalled();
  } );

  it( 'rejects an empty auth header with 401 rather than treating it as a token', () => {
    h = harness( '' );

    requireApiAuth( h.req, h.res, h.next );

    expect( h.status ).toHaveBeenCalledWith( 401 );
    expect( h.next ).not.toHaveBeenCalled();
  } );

  it( 'rejects a wrong token with 403, not 401', () => {
    h = harness( 'not-the-token' );

    requireApiAuth( h.req, h.res, h.next );

    expect( h.status ).toHaveBeenCalledWith( 403 );
    expect( h.send ).toHaveBeenCalledWith(
      { ERROR: true, MESSAGE: 'Forbidden: Invalid authentication token.' }
    );
    expect( h.next ).not.toHaveBeenCalled();
  } );

  it( 'passes a correct token through without responding', () => {
    h = harness( 'test-token' );

    requireApiAuth( h.req, h.res, h.next );

    expect( h.next ).toHaveBeenCalledOnce();
    expect( h.status ).not.toHaveBeenCalled();
  } );

  it( 'reads the token from the documented header name', () => {
    h = harness( 'test-token' );

    requireApiAuth( h.req, h.res, h.next );

    expect( h.readHeader ).toHaveBeenCalledWith( API_AUTH_HEADER );
  } );
} );
