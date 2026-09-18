// -- Ship Destinations Tests --
// This module is the seam points of interest will land on, so the contract it
// offers callers matters more than the two entries currently behind it.

import { describe, it, expect } from 'vitest';

import {
  findCataloguePoint,
  listDestinations,
  parseCoordinates,
  resolveDestination,
  suggestDestinations
} from './Ship_Destinations.js';
import { SOL } from './Ship_Navigation.js';

describe( 'parseCoordinates', () => {
  it( 'accepts the shapes people actually type', () => {
    const expected = { x: 29980, y: 0, z: 0 };

    expect( parseCoordinates( '29980, 0, 0' ) ).toEqual( expected );
    expect( parseCoordinates( '29980 0 0' ) ).toEqual( expected );
    expect( parseCoordinates( '(29980, 0, 0)' ) ).toEqual( expected );
    expect( parseCoordinates( '[29980; 0; 0]' ) ).toEqual( expected );
    expect( parseCoordinates( '  29980 ,0,   0  ' ) ).toEqual( expected );
  } );

  it( 'handles negatives and decimals', () => {
    expect( parseCoordinates( '-1.5, 2.25, -0.75' ) ).toEqual( { x: -1.5, y: 2.25, z: -0.75 } );
  } );

  it( 'refuses a partial guess rather than filling in blanks', () => {
    expect( parseCoordinates( '29980, 0' ) ).toBeNull();
    expect( parseCoordinates( '29980, 0, 0, 0' ) ).toBeNull();
    expect( parseCoordinates( '29980, zero, 0' ) ).toBeNull();
    expect( parseCoordinates( 'Sol' ) ).toBeNull();
    expect( parseCoordinates( '' ) ).toBeNull();
  } );

  it( 'rejects infinities', () => {
    expect( parseCoordinates( 'Infinity, 0, 0' ) ).toBeNull();
  } );
} );

describe( 'findCataloguePoint', () => {
  it( 'finds a point by name, case-insensitively', () => {
    expect( findCataloguePoint( 'Sol' )?.name ).toBe( 'Sol' );
    expect( findCataloguePoint( 'sol' )?.name ).toBe( 'Sol' );
    expect( findCataloguePoint( 'SOL' )?.name ).toBe( 'Sol' );
  } );

  it( 'finds a point by alias', () => {
    expect( findCataloguePoint( 'Earth' )?.name ).toBe( 'Sol' );
    expect( findCataloguePoint( 'sector 001' )?.name ).toBe( 'Sol' );
    expect( findCataloguePoint( 'Sgr A*' )?.name ).toBe( 'Galactic Centre' );
    expect( findCataloguePoint( 'galactic center' )?.name ).toBe( 'Galactic Centre' );
  } );

  it( 'tolerates sloppy spacing', () => {
    expect( findCataloguePoint( '  galactic   core  ' )?.name ).toBe( 'Galactic Centre' );
  } );

  it( 'returns null for anything it does not know', () => {
    expect( findCataloguePoint( 'Qo\'noS' ) ).toBeNull();
  } );

  it( 'places its points where the frame says they are', () => {
    expect( findCataloguePoint( 'Sol' )?.position ).toEqual( SOL );
    expect( findCataloguePoint( 'core' )?.position ).toEqual( { x: 0, y: 0, z: 0 } );
  } );
} );

describe( 'resolveDestination', () => {
  it( 'resolves a named point and reports its name', () => {
    expect( resolveDestination( 'Sol' ) ).toEqual( { position: SOL, name: 'Sol' } );
  } );

  it( 'resolves coordinates, with no name to report', () => {
    const target = resolveDestination( '1, 2, 3' );

    expect( target?.position ).toEqual( { x: 1, y: 2, z: 3 } );
    expect( target?.name ).toBeUndefined();
  } );

  it( 'returns null for input that is neither', () => {
    expect( resolveDestination( 'somewhere nice' ) ).toBeNull();
  } );

  it( 'copies the catalogue position rather than handing out the original', () => {
    // A caller mutating the returned vector must not corrupt the catalogue.
    const first = resolveDestination( 'Sol' );
    if ( first == null ) throw new Error( 'expected Sol to resolve' );
    first.position.x = 0;

    expect( resolveDestination( 'Sol' )?.position ).toEqual( SOL );
  } );
} );

describe( 'suggestDestinations', () => {
  it( 'offers everything on an empty query', () => {
    expect( suggestDestinations( '' ) ).toHaveLength( listDestinations().length );
  } );

  it( 'filters by name and by alias', () => {
    expect( suggestDestinations( 'sol' ).map( r => r.value ) ).toEqual( ['Sol'] );
    expect( suggestDestinations( 'earth' ).map( r => r.value ) ).toEqual( ['Sol'] );
    expect( suggestDestinations( 'core' ).map( r => r.value ) ).toEqual( ['Galactic Centre'] );
  } );

  it( 'offers a typed coordinate triple straight back', () => {
    const rows = suggestDestinations( '29980, 0, 0' );

    expect( rows[0].value ).toBe( '29980, 0, 0' );
    expect( rows[0].name ).toContain( 'Coordinates' );
  } );

  it( 'returns nothing rather than noise for an unknown query', () => {
    expect( suggestDestinations( 'zzzz' ) ).toEqual( [] );
  } );

  it( 'respects the Discord limits on choice count and label length', () => {
    for ( const query of ['', 'sol', '1, 2, 3'] ) {
      const rows = suggestDestinations( query );

      expect( rows.length ).toBeLessThanOrEqual( 25 );
      for ( const row of rows ) expect( row.name.length ).toBeLessThanOrEqual( 100 );
    }
  } );
} );
