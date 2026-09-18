// -- Astrometrics Service Tests --
// The behaviour under test is degradation: whatever the catalogues do, a report
// comes back, and it says which layer answered.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

import {
  MAX_NEIGHBOURS,
  SENSOR_RANGE_LY,
  buildReport,
  describeMode,
  fixCandidates,
  scan,
  suggestScanTargets,
  type AstrometricsOptions
} from './AstrometricsService.js';
import { resolveShipPosition } from '../Ship/Ship_Utilities.js';
import { SOL, projectCourse } from '../Ship/Ship_Navigation.js';
import type { ShipPosition } from '../Auxiliary/Interfaces/ShipInterfaces.js';

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

const LOCAL: AstrometricsOptions = { connection: null, remoteEnabled: false };
const REMOTE: AstrometricsOptions = { connection: null, remoteEnabled: true };

function positionAt( position: { x: number, y: number, z: number } ) {
  const doc: ShipPosition = {
    id: 1,
    status: 'orbit',
    position,
    anchorage: 'Earth',
    updatedAt: new Date(),
    updatedBy: 'system'
  };

  return resolveShipPosition( doc, Date.now() );
}

const DEEP_SPACE = { x: 12000, y: 4000, z: 200 };

const SOL_ROWS: unknown[][] = [
  ['NAME Proxima Centauri', 217.42894222160578, -62.67949018907555, 768.0665, 'M5.5Ve', 'PM*'],
  ['* alf Cen', 219.9020833333333, -60.83397222222223, 750.81, 'G2V+K1V', 'SB*'],
  ["NAME Barnard's star", 269.4520769586187, 4.693364966576667, 546.9759, 'M4V', 'PM*']
];

function stubSimbad( rows: unknown[][] ) {
  vi.stubGlobal( 'fetch', vi.fn( () => Promise.resolve( {
    ok: true,
    status: 200,
    json: () => Promise.resolve( { data: rows } )
  } ) ) );
}

describe( 'buildReport with remote catalogues disabled', () => {
  it( 'still reports position, sector and readings', async () => {
    const report = await buildReport( positionAt( { ...SOL } ), LOCAL );

    expect( report.position.sector.designation ).toBe( '001' );
    expect( report.readings.starCount ).toBeGreaterThan( 0 );
    expect( report.catalogueNote ).toContain( 'disabled' );
  } );

  it( 'makes no outbound calls at all', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal( 'fetch', fetchSpy );

    await buildReport( positionAt( { ...SOL } ), LOCAL );

    expect( fetchSpy ).not.toHaveBeenCalled();
  } );

  it( 'still knows where Sol is', async () => {
    // Sol is added by hand rather than looked up - it has no parallax to itself.
    const report = await buildReport( positionAt( { ...SOL } ), LOCAL );

    expect( report.neighbours.map( n => n.name ) ).toEqual( ['Sol'] );
  } );

  it( 'drops Sol from the list once the ship is well clear of it', async () => {
    const far = projectCourse( SOL, 0, 0, SENSOR_RANGE_LY + 10 );
    const report = await buildReport( positionAt( far ), LOCAL );

    expect( report.neighbours ).toEqual( [] );
  } );
} );

describe( 'buildReport beyond catalogue range', () => {
  it( 'says so rather than reporting nothing at all', async () => {
    const report = await buildReport( positionAt( DEEP_SPACE ), REMOTE );

    expect( report.catalogueNote ).toContain( 'Beyond charted space' );
    expect( report.neighbours ).toEqual( [] );
    expect( report.readings.starCount ).toBeGreaterThan( 0 );
  } );

  it( 'does not waste a call on a query that cannot answer', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal( 'fetch', fetchSpy );

    await buildReport( positionAt( DEEP_SPACE ), REMOTE );

    expect( fetchSpy ).not.toHaveBeenCalled();
  } );
} );

describe( 'buildReport with the catalogue reachable', () => {
  it( 'lists real neighbours alongside Sol, nearest first', async () => {
    stubSimbad( SOL_ROWS );

    const report = await buildReport( positionAt( { ...SOL } ), REMOTE );
    const names = report.neighbours.map( n => n.name );

    expect( names[0] ).toBe( 'Sol' );
    expect( names ).toContain( 'Proxima Centauri' );
    expect( report.catalogueNote ).toBeNull();
  } );

  it( 'caps the list however many are in range', async () => {
    stubSimbad( SOL_ROWS );

    const report = await buildReport( positionAt( { ...SOL } ), REMOTE );

    expect( report.neighbours.length ).toBeLessThanOrEqual( MAX_NEIGHBOURS );
  } );

  it( 'distinguishes empty space from a failed sweep', async () => {
    stubSimbad( [] );

    const report = await buildReport( positionAt( { ...SOL } ), REMOTE );

    // Sol is still there, so the note is about the rest of the volume.
    expect( report.catalogueNote ).toBeNull();
    expect( report.neighbours.map( n => n.name ) ).toEqual( ['Sol'] );
  } );
} );

describe( 'buildReport when the catalogue is down', () => {
  it( 'degrades to local readings rather than failing', async () => {
    vi.stubGlobal( 'fetch', vi.fn( () => Promise.reject( new Error( 'network down' ) ) ) );

    const report = await buildReport( positionAt( { ...SOL } ), REMOTE );

    expect( report.catalogueNote ).toContain( 'unreachable' );
    expect( report.readings.starCount ).toBeGreaterThan( 0 );
    expect( report.neighbours.map( n => n.name ) ).toEqual( ['Sol'] );
  } );

  it( 'survives a catalogue returning an HTTP error', async () => {
    vi.stubGlobal( 'fetch', vi.fn( () => Promise.resolve( {
      ok: false,
      status: 500,
      json: () => Promise.resolve( {} )
    } ) ) );

    const report = await buildReport( positionAt( { ...SOL } ), REMOTE );

    expect( report.catalogueNote ).toContain( 'unreachable' );
  } );
} );

describe( 'fixCandidates', () => {
  it( 'tries the query first', () => {
    expect( fixCandidates( 'Wolf 359', null )[0] ).toBe( 'Wolf 359' );
  } );

  it( 'strips a trailing designator off the parent', () => {
    expect( fixCandidates( 'Bajor', 'Bajoran system' ) ).toContain( 'Bajoran' );
  } );

  it( 'strips a trailing component letter, which is how Vulcan gets a fix', () => {
    // SIMBAD indexes the system as '40 Eridani' and has no '40 Eridani A'.
    expect( fixCandidates( 'Vulcan', '40 Eridani A' ) ).toContain( '40 Eridani' );
  } );

  it( 'never repeats a candidate', () => {
    const candidates = fixCandidates( 'Wolf 359', 'Wolf 359' );

    expect( new Set( candidates.map( c => c.toLowerCase() ) ).size )
      .toBe( candidates.length );
  } );

  it( 'bounds how many lookups a scan can cost', () => {
    expect( fixCandidates( 'a', 'b c d E' ).length ).toBeLessThanOrEqual( 4 );
  } );

  it( 'copes with no parent at all', () => {
    expect( fixCandidates( 'Vega', null ) ).toEqual( ['Vega'] );
  } );
} );

describe( 'scan with remote catalogues disabled', () => {
  it( 'says so and makes no calls', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal( 'fetch', fetchSpy );

    const result = await scan( 'Vulcan', positionAt( { ...SOL } ), LOCAL );

    expect( result.canon ).toBeNull();
    expect( result.fix ).toBeNull();
    expect( result.note ).toContain( 'disabled' );
    expect( fetchSpy ).not.toHaveBeenCalled();
  } );

  it( 'offers no autocomplete rows', async () => {
    expect( await suggestScanTargets( 'Vul', LOCAL ) ).toEqual( [] );
  } );
} );

describe( 'scan when nothing is found', () => {
  it( 'reports both databases coming back empty', async () => {
    vi.stubGlobal( 'fetch', vi.fn( () => Promise.resolve( {
      ok: true,
      status: 200,
      json: () => Promise.resolve( { data: [], astronomicalObjects: [] } )
    } ) ) );

    const result = await scan( 'Qapla', positionAt( { ...SOL } ), REMOTE );

    expect( result.canon ).toBeNull();
    expect( result.fix ).toBeNull();
    expect( result.note ).toContain( 'No record' );
  } );
} );

describe( 'describeMode', () => {
  it( 'names the operating mode', () => {
    expect( describeMode( LOCAL ) ).toContain( 'disabled' );
    expect( describeMode( REMOTE ) ).toContain( 'uncached' );
  } );
} );
