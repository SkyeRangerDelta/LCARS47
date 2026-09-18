// -- Astrometric Coordinate Conversion Tests --
// Checked against points whose answer is fixed by definition rather than by a
// catalogue: the galactic centre, the north galactic pole, and Sol itself.

import { describe, it, expect } from 'vitest';

import {
  LY_PER_PARSEC,
  cartesianToSpherical,
  equatorialToGalactic,
  galacticHeliocentricToGsrf,
  galacticToEquatorial,
  gsrfToGalacticHeliocentric,
  gsrfToIcrsCartesian,
  icrsToGsrf,
  lyToParallaxMas,
  parallaxToLy,
  sphericalToCartesian
} from './Astro_Coordinates.js';
import { SOL, SOL_GALACTIC_RADIUS_LY, distance } from '../Ship/Ship_Navigation.js';

// The two directions that define the galactic frame, in ICRS J2000.
const GALACTIC_CENTRE = { raDeg: 266.404996, decDeg: -28.936175 };
const NORTH_GALACTIC_POLE = { raDeg: 192.859480, decDeg: 27.128250 };

/**
 * The published Hipparcos matrix is quoted to ten decimal places, so its rows
 * are unit vectors only to about 5e-11. That sets the floor on how exactly any
 * of this can round-trip; asserting past it would be testing the constants, not
 * the code.
 */
const ROTATION_DIGITS = 7;

/** Angles are compared on the circle, so 0 and 360 are the same answer. */
function angularDifference( a: number, b: number ): number {
  const diff = ( ( a - b ) % 360 + 360 ) % 360;
  return diff > 180 ? 360 - diff : diff;
}

describe( 'equatorialToGalactic', () => {
  it( 'sends the galactic centre to galactic +x', () => {
    const v = sphericalToCartesian( GALACTIC_CENTRE.raDeg, GALACTIC_CENTRE.decDeg, 1 );
    const g = equatorialToGalactic( v );

    expect( g.x ).toBeCloseTo( 1, 5 );
    expect( g.y ).toBeCloseTo( 0, 5 );
    expect( g.z ).toBeCloseTo( 0, 5 );
  } );

  it( 'sends the north galactic pole to galactic +z', () => {
    const v = sphericalToCartesian(
      NORTH_GALACTIC_POLE.raDeg, NORTH_GALACTIC_POLE.decDeg, 1
    );
    const g = equatorialToGalactic( v );

    expect( g.x ).toBeCloseTo( 0, 5 );
    expect( g.y ).toBeCloseTo( 0, 5 );
    expect( g.z ).toBeCloseTo( 1, 5 );
  } );

  it( 'preserves length - it is a rotation, not a scaling', () => {
    const v = sphericalToCartesian( 83.6, 22.0, 42 );
    const g = equatorialToGalactic( v );

    expect( Math.sqrt( g.x * g.x + g.y * g.y + g.z * g.z ) )
      .toBeCloseTo( 42, ROTATION_DIGITS );
  } );

  it( 'round-trips through the inverse rotation', () => {
    for ( const [ra, dec] of [[0, 0], [83.6, 22], [266.4, -28.9], [359.9, -89]] ) {
      const v = sphericalToCartesian( ra, dec, 7 );
      const back = galacticToEquatorial( equatorialToGalactic( v ) );

      expect( back.x ).toBeCloseTo( v.x, ROTATION_DIGITS );
      expect( back.y ).toBeCloseTo( v.y, ROTATION_DIGITS );
      expect( back.z ).toBeCloseTo( v.z, ROTATION_DIGITS );
    }
  } );
} );

describe( 'sphericalToCartesian / cartesianToSpherical', () => {
  it( 'round-trips', () => {
    for ( const [ra, dec, d] of [[0, 0, 1], [123.4, -45.6, 12], [359, 89, 100]] ) {
      const back = cartesianToSpherical( sphericalToCartesian( ra, dec, d ) );

      expect( angularDifference( back.raDeg, ra ) ).toBeCloseTo( 0, 6 );
      expect( back.decDeg ).toBeCloseTo( dec, 6 );
      expect( back.distance ).toBeCloseTo( d, 9 );
    }
  } );

  it( 'returns right ascension in [0, 360)', () => {
    expect( cartesianToSpherical( { x: -1, y: -0.0001, z: 0 } ).raDeg )
      .toBeGreaterThanOrEqual( 0 );
    expect( cartesianToSpherical( { x: -1, y: -0.0001, z: 0 } ).raDeg )
      .toBeLessThan( 360 );
  } );

  it( 'handles the origin without producing NaNs', () => {
    expect( cartesianToSpherical( { x: 0, y: 0, z: 0 } ) )
      .toEqual( { raDeg: 0, decDeg: 0, distance: 0 } );
  } );
} );

describe( 'parallax', () => {
  it( 'converts a parallax to a distance', () => {
    // 1 arcsecond of parallax is one parsec by definition.
    expect( parallaxToLy( 1000 ) ).toBeCloseTo( LY_PER_PARSEC, 9 );
    // Proxima Centauri, ~768 mas, is about 4.24 ly away.
    expect( parallaxToLy( 768.07 ) ).toBeCloseTo( 4.246, 2 );
  } );

  it( 'refuses a parallax that carries no distance', () => {
    expect( parallaxToLy( null ) ).toBeNull();
    expect( parallaxToLy( 0 ) ).toBeNull();
    expect( parallaxToLy( -5 ) ).toBeNull();
    expect( parallaxToLy( NaN ) ).toBeNull();
  } );

  it( 'inverts cleanly', () => {
    expect( parallaxToLy( lyToParallaxMas( 42 ) ) ).toBeCloseTo( 42, 9 );
  } );
} );

describe( 'galacticHeliocentricToGsrf', () => {
  it( 'places Sol itself at the Sol point', () => {
    expect( galacticHeliocentricToGsrf( { x: 0, y: 0, z: 0 } ) ).toEqual( SOL );
  } );

  it( 'moves coreward as galactic +x increases', () => {
    // Galactic +x points from Sol in at the centre; GSRF +X points back out.
    const inward = galacticHeliocentricToGsrf( { x: 100, y: 0, z: 0 } );

    expect( inward.x ).toBe( SOL_GALACTIC_RADIUS_LY - 100 );
    expect( distance( inward, { x: 0, y: 0, z: 0 } ) )
      .toBeLessThan( SOL_GALACTIC_RADIUS_LY );
  } );

  it( 'shares galactic north with GSRF +Z', () => {
    expect( galacticHeliocentricToGsrf( { x: 0, y: 0, z: 25 } ).z ).toBe( 25 );
  } );

  it( 'is its own inverse', () => {
    const h = { x: 12, y: -34, z: 5.6 };

    expect( gsrfToGalacticHeliocentric( galacticHeliocentricToGsrf( h ) ) ).toEqual( h );
  } );

  it( 'never emits a negative zero into a stored coordinate', () => {
    expect( Object.is( galacticHeliocentricToGsrf( { x: 0, y: 0, z: 0 } ).y, -0 ) )
      .toBe( false );
  } );
} );

describe( 'icrsToGsrf', () => {
  it( 'puts a star at zero distance at Sol', () => {
    const p = icrsToGsrf( 123, 45, 0 );

    expect( p.x ).toBeCloseTo( SOL.x, 9 );
    expect( p.y ).toBeCloseTo( 0, 9 );
    expect( p.z ).toBeCloseTo( 0, 9 );
  } );

  it( 'puts a star toward the galactic centre closer to the core', () => {
    const p = icrsToGsrf( GALACTIC_CENTRE.raDeg, GALACTIC_CENTRE.decDeg, 100 );

    expect( p.x ).toBeCloseTo( SOL.x - 100, 3 );
    expect( p.y ).toBeCloseTo( 0, 3 );
    expect( p.z ).toBeCloseTo( 0, 3 );
  } );

  it( 'puts a star toward the north galactic pole straight above the plane', () => {
    const p = icrsToGsrf( NORTH_GALACTIC_POLE.raDeg, NORTH_GALACTIC_POLE.decDeg, 50 );

    expect( p.x ).toBeCloseTo( SOL.x, 3 );
    expect( p.y ).toBeCloseTo( 0, 3 );
    expect( p.z ).toBeCloseTo( 50, 3 );
  } );

  it( 'keeps the distance from Sol equal to the catalogue distance', () => {
    for ( const [ra, dec, d] of [[0, 0, 10], [83.6, 22, 640], [266.4, -28.9, 4.2]] ) {
      expect( distance( icrsToGsrf( ra, dec, d ), SOL ) ).toBeCloseTo( d, 6 );
    }
  } );

  it( 'agrees with Sirius, checked against its published galactic coordinates', () => {
    // Sirius: ICRS 101.287, -16.716, parallax 379.21 mas. Its galactic
    // coordinates are l = 227.23, b = -8.89 - so it sits below the plane and
    // outward of Sol, meaning a GSRF x greater than Sol's.
    const d = parallaxToLy( 379.21 );
    if ( d == null ) throw new Error( 'expected a distance' );

    const p = icrsToGsrf( 101.287, -16.716, d );

    expect( d ).toBeCloseTo( 8.6, 1 );
    expect( p.x ).toBeGreaterThan( SOL.x );
    expect( p.z ).toBeLessThan( 0 );
    expect( distance( p, SOL ) ).toBeCloseTo( d, 6 );
  } );
} );

describe( 'gsrfToIcrsCartesian', () => {
  it( 'round-trips a catalogue position back to itself', () => {
    for ( const [ra, dec, d] of [[0, 0, 10], [83.6, 22, 640], [312, -55, 3.4]] ) {
      const gsrf = icrsToGsrf( ra, dec, d );
      const back = cartesianToSpherical( gsrfToIcrsCartesian( gsrf ) );

      expect( angularDifference( back.raDeg, ra ) ).toBeCloseTo( 0, 6 );
      expect( back.decDeg ).toBeCloseTo( dec, 6 );
      expect( back.distance ).toBeCloseTo( d, 6 );
    }
  } );

  it( 'puts Sol at the origin of the heliocentric frame', () => {
    const v = gsrfToIcrsCartesian( SOL );

    expect( Math.sqrt( v.x * v.x + v.y * v.y + v.z * v.z ) ).toBeCloseTo( 0, 9 );
  } );
} );
