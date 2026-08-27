// ---- Ship Navigation ----
// Pure geometry and velocity maths for the ship's position. No I/O, no client,
// no database - everything here is a function of its arguments, which is what
// makes the whole navigation model unit testable.
//
// THE FRAME (Galactic Standard Reference Frame, GSRF)
//   Origin (0,0,0) is the galactic centre. Units are light years.
//   The XY plane is the galactic plane; +Z is galactic north. Right handed.
//   +X runs from the galactic centre through Sol, so the +X half-axis IS the
//   Alpha/Beta quadrant boundary - which is exactly where canon puts Sol.

import type {
  Quadrant,
  SectorAddress,
  Vector3
} from '../Auxiliary/Interfaces/ShipInterfaces.js';

// -- Constants --

/**
 * Sol's distance from the galactic centre.
 *
 * Star Trek: Star Charts places Sol ~30,000 ly out; the real figure is nearer
 * 26,700. Canon wins here, because every sector designation below is anchored
 * to it and the whole point is to agree with the maps in the book.
 */
export const SOL_GALACTIC_RADIUS_LY = 30000;

/** Sol, in the GSRF. Sits on the Alpha/Beta boundary by construction. */
export const SOL: Vector3 = { x: SOL_GALACTIC_RADIUS_LY, y: 0, z: 0 };

/** A sector is a 20 ly cube. */
export const SECTOR_SIZE_LY = 20;

/** A sector block is 5 x 5 x 4 sectors: 100 x 100 x 80 ly, 100 sectors. */
export const BLOCK_SECTORS_X = 5;
export const BLOCK_SECTORS_Y = 5;
export const BLOCK_SECTORS_Z = 4;

/**
 * Corner of the sector grid, chosen so Sol lands exactly on a grid corner and
 * its assigned cell is block 0 index 01 - "Sector 001".
 *
 * Star Charts notes Sol sits on the exact corner of its sector and is divided
 * between all eight neighbours, but is assigned to 001 for navigation. This
 * offset reproduces that.
 */
export const SECTOR_GRID_ORIGIN: Vector3 = {
  x: SOL_GALACTIC_RADIUS_LY - SECTOR_SIZE_LY,
  y: 0,
  z: 0
};

/**
 * Which of Alpha/Beta takes y >= 0.
 *
 * Canon fixes the quadrant *adjacency* graph (Alpha-Beta, Alpha-Gamma,
 * Beta-Delta, Gamma-Delta) but not the chirality of the naming relative to
 * galactic north. Flipping this swaps Alpha for Beta and Gamma for Delta and
 * keeps every adjacency intact.
 */
export const ALPHA_TAKES_POSITIVE_Y = true;

// -- Warp velocity --

/** Days per year, used to turn multiples of c into light years per day. */
export const DAYS_PER_YEAR = 365.25;

/** Galaxy class normal cruising speed - sustainable until fuel exhaustion. */
export const WARP_DEFAULT = 6.0;
/** Above this, ordering a course needs bridge officer authorisation. */
export const WARP_OPEN_MAX = 9.0;
/** Maximum sustainable cruise velocity. */
export const WARP_MAX_CRUISE = 9.2;
/** Maximum top speed. Hard ceiling - nothing may be ordered above this. */
export const WARP_MAX_RATED = 9.6;
/** Canon limits sustained velocity above WARP_MAX_CRUISE to twelve hours. */
export const HIGH_WARP_LIMIT_MS = 12 * 60 * 60 * 1000;

/**
 * Furthest a single course may run.
 *
 * Not a canon figure - a guard rail. Without it someone orders 30,000 ly and
 * the ship is locked in transit for a decade of real time.
 */
export const MAX_COURSE_DISTANCE_LY = 5000;

/**
 * TNG Technical Manual velocities above warp 9, as (warp factor, multiple of c).
 *
 * The manual's own curve was drawn by hand, so there is no closed form up here;
 * these are the published sample points and everything between them is
 * interpolated.
 *
 * The first anchor deliberately uses 9^(10/3) (1519c) rather than the printed
 * 1516c so the piecewise function is exactly continuous at warp 9. The 0.2%
 * disagreement is the manual's, not ours.
 */
const WARP_TABLE: ReadonlyArray<readonly [number, number]> = [
  [9, Math.pow( 9, 10 / 3 )],
  [9.2, 1649],
  [9.6, 1909],
  [9.9, 3053],
  [9.99, 7912],
  [9.9999, 199516]
];

/**
 * Velocity of a warp factor, as a multiple of c.
 *
 * `v = w^(10/3)` up to warp 9, then log-log interpolation across the published
 * table. Returns NaN for anything below warp 1 or at/above warp 10, where the
 * TNG scale is undefined.
 */
export function warpToC( warpFactor: number ): number {
  if ( !Number.isFinite( warpFactor ) || warpFactor < 1 || warpFactor >= 10 ) {
    return NaN;
  }

  if ( warpFactor <= 9 ) {
    return Math.pow( warpFactor, 10 / 3 );
  }

  // Interpolate on (-log10(10 - w), log10(v)); both axes are near-linear there,
  // which keeps the curve monotone and its asymptote at warp 10 intact.
  const u = -Math.log10( 10 - warpFactor );

  for ( let i = 0; i < WARP_TABLE.length - 1; i++ ) {
    const [wLow, vLow] = WARP_TABLE[i];
    const [wHigh, vHigh] = WARP_TABLE[i + 1];

    if ( warpFactor <= wHigh ) {
      const uLow = -Math.log10( 10 - wLow );
      const uHigh = -Math.log10( 10 - wHigh );
      const t = ( u - uLow ) / ( uHigh - uLow );

      return Math.pow(
        10,
        Math.log10( vLow ) + t * ( Math.log10( vHigh ) - Math.log10( vLow ) )
      );
    }
  }

  // Past the last anchor the manual gives us nothing to interpolate against.
  return NaN;
}

/** Light years covered per day at a given warp factor. */
export function lyPerDay( warpFactor: number ): number {
  return warpToC( warpFactor ) / DAYS_PER_YEAR;
}

/** Wall-clock milliseconds to cover a distance at a given warp factor. */
export function transitDurationMs( distanceLy: number, warpFactor: number ): number {
  const perDay = lyPerDay( warpFactor );
  if ( !Number.isFinite( perDay ) || perDay <= 0 ) return NaN;

  return ( distanceLy / perDay ) * 86_400_000;
}

/** Furthest a course at this warp factor may run before the twelve-hour rule bites. */
export function highWarpRangeLimitLy( warpFactor: number ): number {
  return lyPerDay( warpFactor ) * ( HIGH_WARP_LIMIT_MS / 86_400_000 );
}

// -- Vector helpers --

export function add( a: Vector3, b: Vector3 ): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract( a: Vector3, b: Vector3 ): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale( v: Vector3, k: number ): Vector3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

export function dot( a: Vector3, b: Vector3 ): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function magnitude( v: Vector3 ): number {
  return Math.sqrt( dot( v, v ) );
}

export function distance( a: Vector3, b: Vector3 ): number {
  return magnitude( subtract( a, b ) );
}

/** Unit vector. Returns the zero vector unchanged rather than producing NaNs. */
export function normalize( v: Vector3 ): Vector3 {
  const m = magnitude( v );
  return m === 0 ? { x: 0, y: 0, z: 0 } : scale( v, 1 / m );
}

/** Linear interpolation, `t` clamped to [0, 1]. */
export function lerp( from: Vector3, to: Vector3, t: number ): Vector3 {
  const k = Math.min( 1, Math.max( 0, t ) );
  return add( from, scale( subtract( to, from ), k ) );
}

// -- Bearings --

/**
 * The ship's local navigation frame at a point.
 *
 * Bearings are absolute rather than relative to the ship's attitude - the bot
 * has no reason to track which way the saucer is pointing, and "000 mark 0
 * takes you to the core" is a far more usable contract than "000 is wherever
 * the bow happens to be".
 *
 *   coreward - azimuth 000, toward the galactic centre, in the galactic plane
 *   spinward - azimuth 090
 *   north    - mark 090, galactic north
 */
export function localFrame( position: Vector3 ): {
  coreward: Vector3
  spinward: Vector3
  north: Vector3
} {
  const north: Vector3 = { x: 0, y: 0, z: 1 };

  // At the galactic centre "toward the core" has no meaning; fall back to +X so
  // the frame stays well defined instead of collapsing into NaNs.
  const planar: Vector3 = { x: -position.x, y: -position.y, z: 0 };
  const coreward = magnitude( planar ) === 0
    ? { x: 1, y: 0, z: 0 }
    : normalize( planar );

  // north x coreward, written out - it is only ever this one cross product.
  // The `+ 0` collapses IEEE negative zero: negating a coreward.y of 0 yields
  // -0, which would then travel into stored coordinates and comparisons.
  const spinward: Vector3 = {
    x: -coreward.y + 0,
    y: coreward.x,
    z: 0
  };

  return { coreward, spinward, north };
}

const DEG = Math.PI / 180;

/** Normalise an angle into [0, 360). */
export function normaliseDegrees( degrees: number ): number {
  return ( ( degrees % 360 ) + 360 ) % 360;
}

/**
 * Unit heading for a canon `azimuth mark elevation` course, at a given point.
 *
 * Both angles run 0-359.9 as they do on screen. mark 090 is galactic north,
 * mark 270 galactic south; marks between 90 and 270 tip the horizontal
 * component backwards, which is the same direction as azimuth+180 with the
 * complementary mark.
 */
export function bearingToVector(
  position: Vector3,
  bearing: number,
  mark: number
): Vector3 {
  const { coreward, spinward, north } = localFrame( position );

  const az = normaliseDegrees( bearing ) * DEG;
  const el = normaliseDegrees( mark ) * DEG;

  const horizontal = Math.cos( el );

  return normalize( add(
    add(
      scale( coreward, Math.cos( az ) * horizontal ),
      scale( spinward, Math.sin( az ) * horizontal )
    ),
    scale( north, Math.sin( el ) )
  ) );
}

/**
 * Inverse of bearingToVector: the course that points along `direction`.
 *
 * The mapping is many-to-one, so this returns the canonical form with mark in
 * [0, 90] or [270, 360) - the same direction expressed with the horizontal
 * component pointing forwards.
 */
export function vectorToBearing(
  position: Vector3,
  direction: Vector3
): { bearing: number, mark: number } {
  const { coreward, spinward, north } = localFrame( position );
  const d = normalize( direction );

  if ( magnitude( d ) === 0 ) return { bearing: 0, mark: 0 };

  const up = dot( d, north );
  const mark = normaliseDegrees( Math.asin( Math.min( 1, Math.max( -1, up ) ) ) / DEG );

  const alongCore = dot( d, coreward );
  const alongSpin = dot( d, spinward );

  // Straight up or straight down: azimuth is arbitrary, so report 000.
  if ( alongCore === 0 && alongSpin === 0 ) return { bearing: 0, mark };

  return {
    bearing: normaliseDegrees( Math.atan2( alongSpin, alongCore ) / DEG ),
    mark
  };
}

/** Where a course of `distanceLy` from `position` ends up. */
export function projectCourse(
  position: Vector3,
  bearing: number,
  mark: number,
  distanceLy: number
): Vector3 {
  return add( position, scale( bearingToVector( position, bearing, mark ), distanceLy ) );
}

// -- Quadrants and sectors --

/** Which quadrant a point falls in. Boundaries resolve to the positive side. */
export function quadrantOf( position: Vector3 ): Quadrant {
  const coreSide = position.x >= 0;
  const positiveY = position.y >= 0;
  const first = positiveY === ALPHA_TAKES_POSITIVE_Y;

  if ( coreSide ) return first ? 'Alpha' : 'Beta';
  return first ? 'Gamma' : 'Delta';
}

/** Floor-modulo: always returns a value in [0, n). */
function mod( value: number, n: number ): number {
  return ( ( value % n ) + n ) % n;
}

/**
 * Zig-zag encode a signed integer onto the naturals: 0,-1,1,-2,2 -> 0,1,2,3,4.
 *
 * Sector block numbers have to be a single non-negative integer, and blocks are
 * indexed from Sol outward in both directions.
 */
function zigzag( value: number ): number {
  return value >= 0 ? 2 * value : -2 * value - 1;
}

/**
 * Sector block number for a signed block index triple.
 *
 * Canon sector numbering is chronological by discovery and therefore not
 * reproducible from geometry by anyone. This is our deterministic projection:
 * it keeps blocks near Sol in the short three-digit range canon uses, and
 * named canon sectors are resolved by lookup rather than by arithmetic.
 */
export function blockNumber( block: Vector3 ): number {
  return zigzag( block.x ) + 32 * zigzag( block.y ) + 1024 * zigzag( block.z );
}

/** Full quadrant / block / sector address of a point. */
export function sectorAddress( position: Vector3 ): SectorAddress {
  const grid: Vector3 = {
    x: Math.floor( ( position.x - SECTOR_GRID_ORIGIN.x ) / SECTOR_SIZE_LY ),
    y: Math.floor( ( position.y - SECTOR_GRID_ORIGIN.y ) / SECTOR_SIZE_LY ),
    z: Math.floor( ( position.z - SECTOR_GRID_ORIGIN.z ) / SECTOR_SIZE_LY )
  };

  const block: Vector3 = {
    x: Math.floor( grid.x / BLOCK_SECTORS_X ),
    y: Math.floor( grid.y / BLOCK_SECTORS_Y ),
    z: Math.floor( grid.z / BLOCK_SECTORS_Z )
  };

  const index =
    mod( grid.x, BLOCK_SECTORS_X )
    + BLOCK_SECTORS_X * mod( grid.y, BLOCK_SECTORS_Y )
    + BLOCK_SECTORS_X * BLOCK_SECTORS_Y * mod( grid.z, BLOCK_SECTORS_Z );

  const number = blockNumber( block );

  return {
    quadrant: quadrantOf( position ),
    grid,
    block: number,
    index,
    designation: String( number * 100 + index ).padStart( 3, '0' )
  };
}

/** Distance from the galactic centre. */
export function distanceFromCore( position: Vector3 ): number {
  return magnitude( position );
}

/** Distance from Sol. */
export function distanceFromSol( position: Vector3 ): number {
  return distance( position, SOL );
}

// -- Course rules --

/**
 * Why a course was refused. A tagged union rather than a string so the command
 * layer owns the wording and this module owns the rules.
 */
export type CourseRejection =
  | { code: 'invalid-bearing' }
  | { code: 'invalid-mark' }
  | { code: 'invalid-distance', maxLy: number }
  | { code: 'warp-out-of-range', maxWarp: number }
  | { code: 'high-warp-restricted', threshold: number }
  | { code: 'high-warp-duration', limitLy: number, alternativeWarp: number }
  | { code: 'same-velocity', warpFactor: number }
  | { code: 'not-under-way' };

export type CourseCheck =
  | { ok: true }
  | { ok: false, reason: CourseRejection };

export interface CourseCheckInput {
  bearing: number
  mark: number
  distanceLy: number
  warpFactor: number
}

/**
 * Is this course legal to order?
 *
 * Order of checks matters. The rated-maximum ceiling is tested before the
 * officer gate so warp 9.7 is refused for everyone, officers and admins alike -
 * it is beyond what the ship can do, not a matter of authorisation.
 */
export function checkCourseOrder(
  order: CourseCheckInput,
  opts: { isOfficer: boolean }
): CourseCheck {
  if ( !Number.isFinite( order.bearing ) || order.bearing < 0 || order.bearing >= 360 ) {
    return { ok: false, reason: { code: 'invalid-bearing' } };
  }

  if ( !Number.isFinite( order.mark ) || order.mark < 0 || order.mark >= 360 ) {
    return { ok: false, reason: { code: 'invalid-mark' } };
  }

  if (
    !Number.isFinite( order.distanceLy )
    || order.distanceLy <= 0
    || order.distanceLy > MAX_COURSE_DISTANCE_LY
  ) {
    return {
      ok: false,
      reason: { code: 'invalid-distance', maxLy: MAX_COURSE_DISTANCE_LY }
    };
  }

  if (
    !Number.isFinite( order.warpFactor )
    || order.warpFactor < 1
    || order.warpFactor > WARP_MAX_RATED
  ) {
    return {
      ok: false,
      reason: { code: 'warp-out-of-range', maxWarp: WARP_MAX_RATED }
    };
  }

  if ( order.warpFactor > WARP_OPEN_MAX && !opts.isOfficer ) {
    return {
      ok: false,
      reason: { code: 'high-warp-restricted', threshold: WARP_OPEN_MAX }
    };
  }

  // Canon caps sustained velocity above the maximum cruise at twelve hours.
  // Enforcing that when the course is ordered, rather than throttling in
  // flight, keeps high warp a short-hop tool and needs no runtime machinery.
  if (
    order.warpFactor > WARP_MAX_CRUISE
    && transitDurationMs( order.distanceLy, order.warpFactor ) > HIGH_WARP_LIMIT_MS
  ) {
    return {
      ok: false,
      reason: {
        code: 'high-warp-duration',
        limitLy: highWarpRangeLimitLy( order.warpFactor ),
        alternativeWarp: WARP_MAX_CRUISE
      }
    };
  }

  return { ok: true };
}

/**
 * Is this change of velocity legal, part way through a voyage?
 *
 * The same tiers as ordering a course, deliberately: without that, warp 6 then
 * a bump to 9.5 would be a free way around the officer gate. The twelve-hour
 * rule is applied to the distance still to run, not the distance already
 * covered - the clock on high warp starts again from the change.
 */
export function checkSpeedChange(
  order: { remainingLy: number, currentWarp: number, warpFactor: number },
  opts: { isOfficer: boolean }
): CourseCheck {
  if (
    !Number.isFinite( order.warpFactor )
    || order.warpFactor < 1
    || order.warpFactor > WARP_MAX_RATED
  ) {
    return {
      ok: false,
      reason: { code: 'warp-out-of-range', maxWarp: WARP_MAX_RATED }
    };
  }

  if ( order.warpFactor === order.currentWarp ) {
    return { ok: false, reason: { code: 'same-velocity', warpFactor: order.currentWarp } };
  }

  if ( order.warpFactor > WARP_OPEN_MAX && !opts.isOfficer ) {
    return {
      ok: false,
      reason: { code: 'high-warp-restricted', threshold: WARP_OPEN_MAX }
    };
  }

  if (
    order.warpFactor > WARP_MAX_CRUISE
    && transitDurationMs( order.remainingLy, order.warpFactor ) > HIGH_WARP_LIMIT_MS
  ) {
    return {
      ok: false,
      reason: {
        code: 'high-warp-duration',
        limitLy: highWarpRangeLimitLy( order.warpFactor ),
        alternativeWarp: WARP_MAX_CRUISE
      }
    };
  }

  return { ok: true };
}

/** Which performance band a warp factor falls in. */
export type VelocityBand = 'cruise' | 'above-cruise' | 'high-warp';

export function velocityBand( warpFactor: number ): VelocityBand {
  if ( warpFactor <= WARP_DEFAULT ) return 'cruise';
  if ( warpFactor <= WARP_OPEN_MAX ) return 'above-cruise';
  return 'high-warp';
}
