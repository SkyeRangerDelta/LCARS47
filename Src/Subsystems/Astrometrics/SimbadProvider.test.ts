// -- SIMBAD Provider Tests --
// fetch is stubbed with a real captured response, so the query construction,
// row parsing, coordinate conversion, filtering and dedupe are all exercised
// without touching the network.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

import {
  SIMBAD_MAX_RANGE_LY,
  coneSearch,
  inCatalogueRange,
  lookupByName,
  safely,
  tidyName
} from './SimbadProvider.js';
import { SOL, distance } from '../Ship/Ship_Navigation.js';

beforeAll( () => {
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'warn' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

afterEach( () => {
  vi.unstubAllGlobals();
} );

/**
 * Rows exactly as SIMBAD returned them for a sweep centred on Sol: the two
 * nearest systems, one of their planets, and the composite plus a component of
 * alpha Centauri.
 */
const SOL_NEIGHBOURHOOD: unknown[][] = [
  ['NAME Proxima Centauri b', 217.42894222160578, -62.67949018907555, 768.0665, null, 'Pl'],
  ['NAME Proxima Centauri', 217.42894222160578, -62.67949018907555, 768.0665, 'M5.5Ve', 'PM*'],
  ['* alf Cen', 219.9020833333333, -60.83397222222223, 750.81, 'G2V+K1V', 'SB*'],
  ['* alf Cen A', 219.90205833170774, -60.83399268831004, 742.12, 'G2V', 'PM*'],
  ['* alf Cen B', 219.89609628987276, -60.83752756558407, 742.12, 'K1V', 'PM*'],
  ["NAME Barnard's star", 269.4520769586187, 4.693364966576667, 546.9759, 'M4V', 'PM*']
];

/** URLSearchParams encodes spaces as '+', which decodeURIComponent leaves alone. */
function decodedQuery( url: string ): string {
  return decodeURIComponent( url ).replace( /\+/g, ' ' );
}

function stubFetch( data: unknown[][], capture?: { url?: string } ) {
  vi.stubGlobal( 'fetch', vi.fn( ( url: string ) => {
    if ( capture != null ) capture.url = url;

    return Promise.resolve( {
      ok: true,
      status: 200,
      json: () => Promise.resolve( { data } )
    } );
  } ) );
}

describe( 'tidyName', () => {
  it( 'strips catalogue decoration', () => {
    expect( tidyName( '* alf Cen A' ) ).toBe( 'alf Cen A' );
    expect( tidyName( "NAME Barnard's star" ) ).toBe( "Barnard's star" );
    expect( tidyName( 'Wolf  359' ) ).toBe( 'Wolf 359' );
  } );

  it( 'leaves an already-clean identifier alone', () => {
    expect( tidyName( 'HD 95735' ) ).toBe( 'HD 95735' );
  } );
} );

describe( 'inCatalogueRange', () => {
  it( 'accepts the solar neighbourhood and refuses deep space', () => {
    expect( inCatalogueRange( SOL ) ).toBe( true );
    expect( inCatalogueRange( { x: SOL.x - 100, y: 0, z: 0 } ) ).toBe( true );
    expect( inCatalogueRange( { x: SOL.x - SIMBAD_MAX_RANGE_LY - 1, y: 0, z: 0 } ) ).toBe( false );
    expect( inCatalogueRange( { x: 0, y: 0, z: 0 } ) ).toBe( false );
  } );
} );

describe( 'coneSearch', () => {
  it( 'returns real neighbours at their published distances', async () => {
    stubFetch( SOL_NEIGHBOURHOOD );

    const found = await coneSearch( SOL, 25, 8 );
    const byName = ( name: string ) => found.find( n => n.name === name );

    expect( byName( 'Proxima Centauri' )?.distanceLy ).toBeCloseTo( 4.25, 1 );
    expect( byName( 'alf Cen' )?.distanceLy ).toBeCloseTo( 4.34, 1 );
    expect( byName( "Barnard's star" )?.distanceLy ).toBeCloseTo( 5.96, 1 );
  } );

  it( 'drops exoplanets, which sit at their host star coordinates', async () => {
    stubFetch( SOL_NEIGHBOURHOOD );

    const found = await coneSearch( SOL, 25, 8 );

    expect( found.some( n => n.name.includes( 'Centauri b' ) ) ).toBe( false );
  } );

  it( 'collapses a multiple system to one entry', async () => {
    // alf Cen, alf Cen A and alf Cen B are one point on any chart.
    stubFetch( SOL_NEIGHBOURHOOD );

    const found = await coneSearch( SOL, 25, 8 );

    expect( found.filter( n => n.name.startsWith( 'alf Cen' ) ) ).toHaveLength( 1 );
  } );

  it( 'orders by range, nearest first', async () => {
    stubFetch( SOL_NEIGHBOURHOOD );

    const found = await coneSearch( SOL, 25, 8 );

    for ( let i = 1; i < found.length; i++ ) {
      expect( found[i].distanceLy ).toBeGreaterThanOrEqual( found[i - 1].distanceLy );
    }
  } );

  it( 'honours the result limit', async () => {
    stubFetch( SOL_NEIGHBOURHOOD );

    expect( await coneSearch( SOL, 25, 2 ) ).toHaveLength( 2 );
  } );

  it( 'excludes anything outside the requested radius', async () => {
    stubFetch( SOL_NEIGHBOURHOOD );

    const found = await coneSearch( SOL, 5, 8 );

    expect( found.every( n => n.distanceLy <= 5 ) ).toBe( true );
    expect( found.some( n => n.name === "Barnard's star" ) ).toBe( false );
  } );

  it( 'gives every neighbour a bearing usable from the ship', async () => {
    stubFetch( SOL_NEIGHBOURHOOD );

    for ( const n of await coneSearch( SOL, 25, 8 ) ) {
      expect( n.bearing ).toBeGreaterThanOrEqual( 0 );
      expect( n.bearing ).toBeLessThan( 360 );
      expect( n.mark ).toBeGreaterThanOrEqual( 0 );
      expect( n.mark ).toBeLessThan( 360 );
      expect( distance( n.position, SOL ) ).toBeCloseTo( n.distanceLy, 6 );
    }
  } );

  it( 'asks the database to do the volume filtering', async () => {
    const capture: { url?: string } = {};
    stubFetch( SOL_NEIGHBOURHOOD, capture );

    await coneSearch( SOL, 25, 8 );
    const query = decodedQuery( capture.url ?? '' );

    expect( query ).toContain( 'FROM basic' );
    expect( query ).toContain( 'plx_value' );
    expect( query ).toContain( 'RADIANS(dec)' );
  } );

  it( 'centres the query on the ship, in heliocentric coordinates', async () => {
    // From Sol the offsets are zero; ten light years out they must not be.
    const atSol: { url?: string } = {};
    stubFetch( [], atSol );
    await coneSearch( SOL, 25, 8 );

    const away: { url?: string } = {};
    stubFetch( [], away );
    await coneSearch( { x: SOL.x - 10, y: 0, z: 0 }, 25, 8 );

    expect( decodedQuery( atSol.url ?? '' ) ).toContain( '- (0))' );
    expect( decodedQuery( away.url ?? '' ) ).not.toContain( '- (0))' );
  } );

  it( 'does not call out at all when beyond catalogue range', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal( 'fetch', fetchSpy );

    expect( await coneSearch( { x: 0, y: 0, z: 0 }, 25, 8 ) ).toEqual( [] );
    expect( fetchSpy ).not.toHaveBeenCalled();
  } );

  it( 'ignores rows with no usable parallax', async () => {
    stubFetch( [
      ['* nothing', 10, 10, null, null, 'Star'],
      ['* negative', 10, 10, -3, null, 'Star'],
      ['NAME Proxima Centauri', 217.42894222160578, -62.67949018907555, 768.0665, 'M5.5Ve', 'PM*']
    ] );

    const found = await coneSearch( SOL, 25, 8 );

    expect( found ).toHaveLength( 1 );
    expect( found[0].name ).toBe( 'Proxima Centauri' );
  } );

  it( 'throws on an HTTP failure, for the caller to absorb', async () => {
    vi.stubGlobal( 'fetch', vi.fn( () => Promise.resolve( {
      ok: false,
      status: 503,
      json: () => Promise.resolve( {} )
    } ) ) );

    await expect( coneSearch( SOL, 25, 8 ) ).rejects.toThrow( '503' );
  } );
} );

describe( 'lookupByName', () => {
  it( 'escapes an apostrophe rather than breaking the query', async () => {
    const capture: { url?: string } = {};
    stubFetch( [], capture );

    await lookupByName( "Qo'noS", SOL );
    const query = decodedQuery( capture.url ?? '' );

    expect( query ).toContain( "Qo''noS" );
  } );

  it( 'returns null when nothing matches', async () => {
    stubFetch( [] );

    expect( await lookupByName( 'Bajor', SOL ) ).toBeNull();
  } );

  it( 'positions a match relative to the ship, not to Sol', async () => {
    stubFetch( [SOL_NEIGHBOURHOOD[5]] );

    const from = { x: SOL.x - 3, y: 0, z: 0 };
    const found = await lookupByName( "Barnard's star", from );

    expect( found ).not.toBeNull();
    expect( found?.distanceLy ).toBeCloseTo( distance( found?.position ?? SOL, from ), 9 );
  } );
} );

describe( 'safely', () => {
  it( 'passes a result through untouched', async () => {
    expect( await safely( 'test', () => Promise.resolve( 42 ), 0 ) ).toBe( 42 );
  } );

  it( 'returns the fallback rather than throwing', async () => {
    const fallback = await safely(
      'test',
      () => Promise.reject( new Error( 'catalogue down' ) ),
      'fallback'
    );

    expect( fallback ).toBe( 'fallback' );
  } );
} );
