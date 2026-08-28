// -- STAPI Provider Tests --
// fetch is stubbed with a real captured response. The search for "Vulcan" is
// exactly what stapi.co returns, six records deep, which is precisely the case
// pickPrimary exists to resolve.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

import {
  describeType,
  pickPrimary,
  searchByName,
  suggestObjects
} from './StapiProvider.js';
import type { CanonObject } from './AstroInterfaces.js';

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

/** The live response for name=Vulcan, verbatim. */
const VULCAN_RESPONSE = {
  astronomicalObjects: [
    {
      uid: 'ASMA0000117471',
      name: 'New Vulcan',
      astronomicalObjectType: 'PLANET',
      location: { uid: 'ASMA0000025892', name: 'Alpha Quadrant' }
    },
    {
      uid: 'ASMA0000115323',
      name: 'Vulcan',
      astronomicalObjectType: 'M_CLASS_PLANET',
      location: { uid: 'ASMA0000001073', name: '40 Eridani A' }
    },
    {
      uid: 'ASMA0000219954',
      name: 'Vulcan border',
      astronomicalObjectType: 'REGION',
      location: null
    },
    {
      uid: 'ASMA0000273590',
      name: 'Vulcan sector',
      astronomicalObjectType: 'SECTOR',
      location: { uid: 'ASMA0000002015', name: 'Beta Quadrant' }
    },
    {
      uid: 'ASMA0000229674',
      name: 'Vulcan system',
      astronomicalObjectType: 'STAR_SYSTEM',
      location: { uid: 'ASMA0000025892', name: 'Alpha Quadrant' }
    }
  ]
};

function stubFetch( body: unknown, capture?: { body?: string } ) {
  vi.stubGlobal( 'fetch', vi.fn( ( _url: string, init?: { body?: string } ) => {
    if ( capture != null ) capture.body = init?.body;

    return Promise.resolve( {
      ok: true,
      status: 200,
      json: () => Promise.resolve( body )
    } );
  } ) );
}

describe( 'searchByName', () => {
  it( 'parses the canon records out of a live response', async () => {
    stubFetch( VULCAN_RESPONSE );

    const objects = await searchByName( 'Vulcan' );

    expect( objects ).toHaveLength( 5 );
    expect( objects[1].name ).toBe( 'Vulcan' );
    expect( objects[1].objectType ).toBe( 'M_CLASS_PLANET' );
    expect( objects[1].location?.name ).toBe( '40 Eridani A' );
  } );

  it( 'keeps a record with no parent location', async () => {
    stubFetch( VULCAN_RESPONSE );

    const border = ( await searchByName( 'Vulcan' ) ).find( o => o.name === 'Vulcan border' );

    expect( border?.location ).toBeNull();
  } );

  it( 'sends the name as a form field', async () => {
    const capture: { body?: string } = {};
    stubFetch( VULCAN_RESPONSE, capture );

    await searchByName( 'Wolf 359' );

    expect( capture.body ).toBe( 'name=Wolf+359' );
  } );

  it( 'skips the call entirely for an empty query', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal( 'fetch', fetchSpy );

    expect( await searchByName( '   ' ) ).toEqual( [] );
    expect( fetchSpy ).not.toHaveBeenCalled();
  } );

  it( 'drops malformed records rather than trusting them', async () => {
    stubFetch( { astronomicalObjects: [
      { uid: 'x' },
      { name: 'no uid' },
      { uid: 'ok', name: 'Fine', astronomicalObjectType: 'STAR', location: null }
    ] } );

    const objects = await searchByName( 'anything' );

    expect( objects ).toHaveLength( 1 );
    expect( objects[0].name ).toBe( 'Fine' );
  } );

  it( 'throws on an HTTP failure, for the caller to absorb', async () => {
    vi.stubGlobal( 'fetch', vi.fn( () => Promise.resolve( {
      ok: false,
      status: 502,
      json: () => Promise.resolve( {} )
    } ) ) );

    await expect( searchByName( 'Vulcan' ) ).rejects.toThrow( '502' );
  } );
} );

describe( 'pickPrimary', () => {
  const objects: CanonObject[] = VULCAN_RESPONSE.astronomicalObjects.map( o => ( {
    uid: o.uid,
    name: o.name,
    objectType: o.astronomicalObjectType,
    location: o.location
  } ) );

  it( 'picks the planet, not the sector or the border region', () => {
    // An exact name match wins first, then the most concrete kind of object.
    expect( pickPrimary( objects, 'Vulcan' )?.name ).toBe( 'Vulcan' );
  } );

  it( 'falls back to the most concrete record when nothing matches exactly', () => {
    const inexact = objects.filter( o => o.name !== 'Vulcan' );

    expect( pickPrimary( inexact, 'Vulcan' )?.objectType ).toBe( 'PLANET' );
  } );

  it( 'ignores case when matching the name', () => {
    expect( pickPrimary( objects, '  vULCAN ' )?.name ).toBe( 'Vulcan' );
  } );

  it( 'returns null for an empty list', () => {
    expect( pickPrimary( [], 'Vulcan' ) ).toBeNull();
  } );

  it( 'copes with an unranked or missing object type', () => {
    const odd: CanonObject[] = [
      { uid: '1', name: 'A', objectType: 'COMET', location: null },
      { uid: '2', name: 'B', objectType: null, location: null }
    ];

    expect( pickPrimary( odd, 'nothing' ) ).not.toBeNull();
  } );
} );

describe( 'describeType', () => {
  it( 'turns a shouted enum into readable text', () => {
    expect( describeType( 'STAR_SYSTEM' ) ).toBe( 'Star system' );
    expect( describeType( 'NEBULA' ) ).toBe( 'Nebula' );
    expect( describeType( 'M_CLASS_PLANET' ) ).toBe( 'M-class planet' );
  } );
} );

describe( 'suggestObjects', () => {
  it( 'offers a row per record, labelled with its kind', async () => {
    stubFetch( VULCAN_RESPONSE );

    const rows = await suggestObjects( 'Vulcan' );

    expect( rows[1] ).toEqual( { name: 'Vulcan — M-class planet', value: 'Vulcan' } );
  } );

  it( 'waits for a couple of characters before calling out', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal( 'fetch', fetchSpy );

    expect( await suggestObjects( 'V' ) ).toEqual( [] );
    expect( fetchSpy ).not.toHaveBeenCalled();
  } );

  it( 'returns nothing rather than throwing when the catalogue is slow', async () => {
    vi.stubGlobal( 'fetch', vi.fn( () => Promise.reject( new Error( 'timed out' ) ) ) );

    expect( await suggestObjects( 'Vulcan' ) ).toEqual( [] );
  } );

  it( 'respects the Discord limits on choice count and label length', async () => {
    stubFetch( { astronomicalObjects: Array.from( { length: 40 }, ( _, i ) => ( {
      uid: `u${ i }`,
      name: `Object ${ i } ${ 'x'.repeat( 200 ) }`,
      astronomicalObjectType: 'STAR',
      location: null
    } ) ) } );

    const rows = await suggestObjects( 'Object' );

    expect( rows.length ).toBeLessThanOrEqual( 25 );
    for ( const row of rows ) {
      expect( row.name.length ).toBeLessThanOrEqual( 100 );
      expect( row.value.length ).toBeLessThanOrEqual( 100 );
    }
  } );
} );
