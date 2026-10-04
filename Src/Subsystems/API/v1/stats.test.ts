// -- Stats Route Tests --
// Exercised over real HTTP against the real express router rather than by
// calling the handler directly. The finding this guards (risk-list R9a) was
// that an anonymous GET returned 200, and only a real request through the real
// middleware chain can show that it no longer does.
//
// The client double reports itself as not ready, so the authenticated path
// returns its bare STATE flag without needing a database or a Discord gateway.
// That is enough to prove the gate runs ahead of the readiness check: if the
// order were reversed, the unauthenticated cases below would see 200 STATE too.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import exp from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock( '../../Utilities/EnvUtils', () => ( {
  getEnv: () => ( {
    RDS: 'mongodb://localhost:27017',
    API_HOST: 'localhost',
    API_PORT: '9121',
    API_AUTH_TOKEN: 'test-token'
  } ),
  isFeatureEnabled: () => false,
  default: { getEnv: () => ( {} ), isFeatureEnabled: () => false }
} ) );

vi.mock( '../../Utilities/SysUtils.js', () => ( {
  default: { log: vi.fn(), formatProcess_mem: vi.fn(), formatMSDiff: vi.fn(), getVersion: () => 'V47.0.0.0' }
} ) );

import stats from './stats';
import { API_AUTH_HEADER } from '../OpenAPISpec';
import type { LCARSClient } from '../../Auxiliary/LCARSClient';

const NOT_READY = { isReady: () => false } as unknown as LCARSClient;

let server: Server;
let base: string;

beforeAll( async () => {
  const app = exp();
  app.use( stats.router( NOT_READY ) );

  await new Promise<void>( resolve => {
    server = app.listen( 0, '127.0.0.1', () => resolve() );
  } );

  base = `http://127.0.0.1:${ ( server.address() as AddressInfo ).port }`;
} );

afterAll( async () => {
  await new Promise<void>( resolve => {
    server.close( () => resolve() );
  } );
} );

describe( 'GET /stats', () => {
  it( 'refuses an anonymous request with 401', async () => {
    const res = await fetch( `${ base }/stats` );

    expect( res.status ).toBe( 401 );
    await expect( res.json() ).resolves.toEqual(
      { ERROR: true, MESSAGE: 'Unauthorized: Missing authentication header.' }
    );
  } );

  it( 'leaks no telemetry in the rejection body', async () => {
    // The point of the gate. A 401 that still described the bot would not fix
    // anything, so assert on what is absent as well as on the status.
    const body = await ( await fetch( `${ base }/stats` ) ).text();

    for ( const field of [ 'MEDIA_PLAYER', 'VERSION', 'SESSION', 'STATE', 'QUERIES' ] ) {
      expect( body, `401 body mentions ${ field }` ).not.toContain( field );
    }
  } );

  it( 'refuses a wrong token with 403', async () => {
    const res = await fetch( `${ base }/stats`, {
      headers: { [API_AUTH_HEADER]: 'not-the-token' }
    } );

    expect( res.status ).toBe( 403 );
  } );

  it( 'serves a correctly authenticated request', async () => {
    const res = await fetch( `${ base }/stats`, {
      headers: { [API_AUTH_HEADER]: 'test-token' }
    } );

    expect( res.status ).toBe( 200 );
    await expect( res.json() ).resolves.toEqual( { STATE: false } );
  } );
} );
