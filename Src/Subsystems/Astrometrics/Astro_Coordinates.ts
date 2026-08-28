// ---- Astrometric Coordinate Conversion ----
// Bridges real astronomy onto the ship's frame.
//
// Catalogues speak ICRS/J2000: right ascension, declination and a parallax.
// The ship speaks GSRF: light years, origin at the galactic centre, +X running
// out through Sol. Everything here is the fixed rotation and translation
// between the two, and it is pure so it can be checked against known points.
//
// The chain, in both directions:
//   (ra, dec, distance)  <->  heliocentric equatorial Cartesian
//                        <->  heliocentric galactic Cartesian
//                        <->  GSRF

import { SOL_GALACTIC_RADIUS_LY } from '../Ship/Ship_Navigation.js';
import type { Vector3 } from '../Auxiliary/Interfaces/ShipInterfaces.js';

/** Light years in a parsec. */
export const LY_PER_PARSEC = 3.261563777;

const DEG = Math.PI / 180;

/**
 * ICRS to galactic rotation, J2000.
 *
 * The standard Hipparcos matrix (ESA SP-1200 vol. 1 sect. 1.5.3). Rows, in
 * order, are the galactic x, y and z axes expressed in ICRS: galactic +x points
 * at the galactic centre, +z at the north galactic pole, +y completes a
 * right-handed set in the direction of galactic rotation.
 */
const ICRS_TO_GALACTIC: readonly ( readonly [number, number, number] )[] = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [ 0.4941094279, -0.4448296300,  0.7469822445],
  [-0.8676661490, -0.1980763734,  0.4559837762]
];

function applyMatrix(
  matrix: readonly ( readonly [number, number, number] )[],
  v: Vector3
): Vector3 {
  return {
    x: matrix[0][0] * v.x + matrix[0][1] * v.y + matrix[0][2] * v.z,
    y: matrix[1][0] * v.x + matrix[1][1] * v.y + matrix[1][2] * v.z,
    z: matrix[2][0] * v.x + matrix[2][1] * v.y + matrix[2][2] * v.z
  };
}

/** Rotate an ICRS vector into the galactic frame. */
export function equatorialToGalactic( v: Vector3 ): Vector3 {
  return applyMatrix( ICRS_TO_GALACTIC, v );
}

/** Rotate a galactic vector back into ICRS. The rotation is orthogonal, so this is the transpose. */
export function galacticToEquatorial( v: Vector3 ): Vector3 {
  return {
    x: ICRS_TO_GALACTIC[0][0] * v.x + ICRS_TO_GALACTIC[1][0] * v.y + ICRS_TO_GALACTIC[2][0] * v.z,
    y: ICRS_TO_GALACTIC[0][1] * v.x + ICRS_TO_GALACTIC[1][1] * v.y + ICRS_TO_GALACTIC[2][1] * v.z,
    z: ICRS_TO_GALACTIC[0][2] * v.x + ICRS_TO_GALACTIC[1][2] * v.y + ICRS_TO_GALACTIC[2][2] * v.z
  };
}

/** Right ascension, declination and a distance, as a Cartesian vector. */
export function sphericalToCartesian( raDeg: number, decDeg: number, distance: number ): Vector3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;

  return {
    x: distance * Math.cos( dec ) * Math.cos( ra ),
    y: distance * Math.cos( dec ) * Math.sin( ra ),
    z: distance * Math.sin( dec )
  };
}

/** Inverse of sphericalToCartesian. Right ascension comes back in [0, 360). */
export function cartesianToSpherical( v: Vector3 ): {
  raDeg: number
  decDeg: number
  distance: number
} {
  const distance = Math.sqrt( v.x * v.x + v.y * v.y + v.z * v.z );
  if ( distance === 0 ) return { raDeg: 0, decDeg: 0, distance: 0 };

  const raDeg = ( ( Math.atan2( v.y, v.x ) / DEG ) + 360 ) % 360;
  const decDeg = Math.asin( Math.min( 1, Math.max( -1, v.z / distance ) ) ) / DEG;

  return { raDeg, decDeg, distance };
}

/** Distance in light years from a parallax in milliarcseconds. Null for a useless parallax. */
export function parallaxToLy( parallaxMas: number | null ): number | null {
  if ( parallaxMas == null || !Number.isFinite( parallaxMas ) || parallaxMas <= 0 ) return null;

  return ( 1000 / parallaxMas ) * LY_PER_PARSEC;
}

/** Parallax in milliarcseconds for a distance in light years. */
export function lyToParallaxMas( distanceLy: number ): number {
  if ( !Number.isFinite( distanceLy ) || distanceLy <= 0 ) return Number.POSITIVE_INFINITY;

  return 1000 / ( distanceLy / LY_PER_PARSEC );
}

/**
 * Heliocentric galactic Cartesian to GSRF, and back.
 *
 * GSRF +X runs from the galactic centre out through Sol, so it is the opposite
 * of galactic +x, which points from Sol in at the centre. +Z is shared. +Y is
 * then negated to keep the frame right-handed.
 *
 * The mapping is its own inverse, which is why one function serves both ways.
 */
export function galacticHeliocentricToGsrf( h: Vector3 ): Vector3 {
  return {
    x: SOL_GALACTIC_RADIUS_LY - h.x,
    y: -h.y + 0,
    z: h.z
  };
}

/** GSRF to heliocentric galactic Cartesian. Same arithmetic - the map is an involution. */
export function gsrfToGalacticHeliocentric( p: Vector3 ): Vector3 {
  return galacticHeliocentricToGsrf( p );
}

/** A catalogue position - right ascension, declination, distance - as a point in the ship's frame. */
export function icrsToGsrf( raDeg: number, decDeg: number, distanceLy: number ): Vector3 {
  return galacticHeliocentricToGsrf(
    equatorialToGalactic( sphericalToCartesian( raDeg, decDeg, distanceLy ) )
  );
}

/**
 * A point in the ship's frame as a heliocentric ICRS Cartesian vector, in light
 * years. This is what a catalogue query has to be phrased in.
 */
export function gsrfToIcrsCartesian( p: Vector3 ): Vector3 {
  return galacticToEquatorial( gsrfToGalacticHeliocentric( p ) );
}

export default {
  LY_PER_PARSEC,
  equatorialToGalactic,
  galacticToEquatorial,
  sphericalToCartesian,
  cartesianToSpherical,
  parallaxToLy,
  lyToParallaxMas,
  galacticHeliocentricToGsrf,
  gsrfToGalacticHeliocentric,
  icrsToGsrf,
  gsrfToIcrsCartesian
};
