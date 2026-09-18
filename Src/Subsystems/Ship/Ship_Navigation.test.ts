// -- Ship Navigation Tests --
// The navigation maths is the load-bearing part of the ship subsystem: every
// sector designation, bearing and ETA the bot reports comes out of here, and
// none of it is checkable by eye. So it gets tested hard.

import { describe, it, expect } from 'vitest';

import {
  MAX_COURSE_DISTANCE_LY,
  SOL,
  SECTOR_SIZE_LY,
  WARP_DEFAULT,
  WARP_OPEN_MAX,
  WARP_MAX_CRUISE,
  WARP_MAX_RATED,
  bearingToVector,
  checkCourseOrder,
  checkSpeedChange,
  distanceFromCore,
  distanceFromSol,
  highWarpRangeLimitLy,
  lerp,
  localFrame,
  lyPerDay,
  normaliseDegrees,
  projectCourse,
  quadrantOf,
  sectorAddress,
  transitDurationMs,
  vectorToBearing,
  velocityBand,
  warpToC
} from './Ship_Navigation.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

describe( 'sectorAddress', () => {
  it( 'places Sol in Sector 001 of the Alpha Quadrant', () => {
    const address = sectorAddress( SOL );

    expect( address.designation ).toBe( '001' );
    expect( address.quadrant ).toBe( 'Alpha' );
    expect( address.block ).toBe( 0 );
    expect( address.index ).toBe( 1 );
    expect( address.grid ).toEqual( { x: 1, y: 0, z: 0 } );
  } );

  it( 'keeps the whole 20 ly cube around Sol in the same sector', () => {
    // Sol sits on the grid corner, so the cell runs from Sol to Sol + 20 ly.
    const insideCell = { x: SOL.x + 19.9, y: 19.9, z: 19.9 };

    expect( sectorAddress( insideCell ).designation ).toBe( '001' );
  } );

  it( 'advances the designation one step per sector along +X', () => {
    const next = { x: SOL.x + SECTOR_SIZE_LY, y: 0, z: 0 };

    expect( sectorAddress( next ).index ).toBe( 2 );
    expect( sectorAddress( next ).designation ).toBe( '002' );
  } );

  it( 'rolls into the next block after five sectors of X', () => {
    // Sol is index 1 of block 0, so four more sectors fill the block.
    const nextBlock = { x: SOL.x + 4 * SECTOR_SIZE_LY, y: 0, z: 0 };
    const address = sectorAddress( nextBlock );

    expect( address.grid.x ).toBe( 5 );
    expect( address.block ).not.toBe( 0 );
    expect( address.index ).toBe( 0 );
  } );

  it( 'gives every block a distinct number', () => {
    const seen = new Set<number>();

    for ( let bx = -2; bx <= 2; bx++ ) {
      for ( let by = -2; by <= 2; by++ ) {
        for ( let bz = -2; bz <= 2; bz++ ) {
          const point = {
            x: SOL.x + bx * 5 * SECTOR_SIZE_LY,
            y: by * 5 * SECTOR_SIZE_LY,
            z: bz * 4 * SECTOR_SIZE_LY
          };
          seen.add( sectorAddress( point ).block );
        }
      }
    }

    expect( seen.size ).toBe( 125 );
  } );

  it( 'never produces a negative index', () => {
    for ( let i = -60; i <= 60; i += 7 ) {
      const address = sectorAddress( { x: SOL.x + i, y: i, z: i } );

      expect( address.index ).toBeGreaterThanOrEqual( 0 );
      expect( address.index ).toBeLessThan( 100 );
      expect( address.block ).toBeGreaterThanOrEqual( 0 );
    }
  } );
} );

describe( 'quadrantOf', () => {
  it( 'assigns each octant of the galactic plane', () => {
    expect( quadrantOf( { x: 100, y: 100, z: 0 } ) ).toBe( 'Alpha' );
    expect( quadrantOf( { x: 100, y: -100, z: 0 } ) ).toBe( 'Beta' );
    expect( quadrantOf( { x: -100, y: 100, z: 0 } ) ).toBe( 'Gamma' );
    expect( quadrantOf( { x: -100, y: -100, z: 0 } ) ).toBe( 'Delta' );
  } );

  it( 'ignores elevation', () => {
    expect( quadrantOf( { x: 100, y: 100, z: 5000 } ) ).toBe( 'Alpha' );
    expect( quadrantOf( { x: 100, y: 100, z: -5000 } ) ).toBe( 'Alpha' );
  } );

  it( 'puts Sol in Alpha, on the Alpha/Beta boundary', () => {
    expect( SOL.y ).toBe( 0 );
    expect( quadrantOf( SOL ) ).toBe( 'Alpha' );
  } );

  it( 'reproduces the canon adjacency graph', () => {
    // Alpha borders Beta and Gamma; Delta borders Beta and Gamma. Alpha and
    // Delta are diagonal, as are Beta and Gamma. Straddling each boundary is
    // the cheapest way to assert that.
    const acrossAlphaBeta = [
      quadrantOf( { x: 100, y: 1, z: 0 } ),
      quadrantOf( { x: 100, y: -1, z: 0 } )
    ];
    const acrossAlphaGamma = [
      quadrantOf( { x: 1, y: 100, z: 0 } ),
      quadrantOf( { x: -1, y: 100, z: 0 } )
    ];
    const acrossBetaDelta = [
      quadrantOf( { x: 1, y: -100, z: 0 } ),
      quadrantOf( { x: -1, y: -100, z: 0 } )
    ];
    const acrossGammaDelta = [
      quadrantOf( { x: -100, y: 1, z: 0 } ),
      quadrantOf( { x: -100, y: -1, z: 0 } )
    ];

    expect( acrossAlphaBeta ).toEqual( ['Alpha', 'Beta'] );
    expect( acrossAlphaGamma ).toEqual( ['Alpha', 'Gamma'] );
    expect( acrossBetaDelta ).toEqual( ['Beta', 'Delta'] );
    expect( acrossGammaDelta ).toEqual( ['Gamma', 'Delta'] );
  } );
} );

describe( 'localFrame', () => {
  it( 'points azimuth 000 at the galactic core', () => {
    const { coreward } = localFrame( SOL );

    expect( coreward.x ).toBeCloseTo( -1, 10 );
    expect( coreward.y ).toBeCloseTo( 0, 10 );
    expect( coreward.z ).toBe( 0 );
  } );

  it( 'stays well defined at the galactic centre', () => {
    const { coreward, spinward, north } = localFrame( { x: 0, y: 0, z: 0 } );

    expect( Number.isNaN( coreward.x ) ).toBe( false );
    expect( coreward ).toEqual( { x: 1, y: 0, z: 0 } );
    expect( spinward ).toEqual( { x: 0, y: 1, z: 0 } );
    expect( north ).toEqual( { x: 0, y: 0, z: 1 } );
  } );
} );

describe( 'bearingToVector', () => {
  it( 'sends bearing 000 mark 0 toward the core', () => {
    const destination = projectCourse( SOL, 0, 0, 10 );

    expect( destination.x ).toBeCloseTo( SOL.x - 10, 6 );
    expect( distanceFromCore( destination ) ).toBeLessThan( distanceFromCore( SOL ) );
  } );

  it( 'sends bearing 180 mark 0 toward the rim', () => {
    const destination = projectCourse( SOL, 180, 0, 10 );

    expect( destination.x ).toBeCloseTo( SOL.x + 10, 6 );
    expect( distanceFromCore( destination ) ).toBeGreaterThan( distanceFromCore( SOL ) );
  } );

  it( 'sends mark 090 to galactic north, whatever the azimuth', () => {
    for ( const bearing of [0, 90, 180, 270] ) {
      const destination = projectCourse( SOL, bearing, 90, 10 );

      expect( destination.x ).toBeCloseTo( SOL.x, 6 );
      expect( destination.y ).toBeCloseTo( 0, 6 );
      expect( destination.z ).toBeCloseTo( 10, 6 );
    }
  } );

  it( 'sends mark 270 to galactic south', () => {
    expect( projectCourse( SOL, 0, 270, 10 ).z ).toBeCloseTo( -10, 6 );
  } );

  it( 'always returns a unit heading', () => {
    for ( const bearing of [0, 37, 90, 181, 275, 359] ) {
      for ( const mark of [0, 15, 90, 200, 300] ) {
        const v = bearingToVector( SOL, bearing, mark );
        const length = Math.sqrt( v.x * v.x + v.y * v.y + v.z * v.z );

        expect( length ).toBeCloseTo( 1, 10 );
      }
    }
  } );

  it( 'moves the ship exactly the distance ordered', () => {
    const destination = projectCourse( SOL, 137, 42, 3.5 );

    expect( distanceFromSol( destination ) ).toBeCloseTo( 3.5, 9 );
  } );
} );

describe( 'vectorToBearing', () => {
  it( 'round-trips courses in the canonical mark range', () => {
    // The mapping is many-to-one: marks between 90 and 270 tip the horizontal
    // component backwards and come back as an equivalent forward-facing course.
    // Only the canonical range is expected to survive a round trip verbatim.
    for ( const bearing of [0, 37, 90, 181, 275, 359] ) {
      for ( const mark of [0, 15, 89, 300, 359] ) {
        const heading = bearingToVector( SOL, bearing, mark );
        const back = vectorToBearing( SOL, heading );

        expect( back.bearing ).toBeCloseTo( bearing, 6 );
        expect( back.mark ).toBeCloseTo( mark, 6 );
      }
    }
  } );

  it( 'reports azimuth 000 for a straight-up heading', () => {
    const back = vectorToBearing( SOL, { x: 0, y: 0, z: 1 } );

    expect( back.mark ).toBeCloseTo( 90, 6 );
    expect( back.bearing ).toBe( 0 );
  } );

  it( 'returns a zero course for a zero direction', () => {
    expect( vectorToBearing( SOL, { x: 0, y: 0, z: 0 } ) ).toEqual( { bearing: 0, mark: 0 } );
  } );
} );

describe( 'normaliseDegrees', () => {
  it( 'wraps into [0, 360)', () => {
    expect( normaliseDegrees( 0 ) ).toBe( 0 );
    expect( normaliseDegrees( 360 ) ).toBe( 0 );
    expect( normaliseDegrees( 400 ) ).toBe( 40 );
    expect( normaliseDegrees( -90 ) ).toBe( 270 );
    expect( normaliseDegrees( -450 ) ).toBe( 270 );
  } );
} );

describe( 'warpToC', () => {
  it( 'matches the TNG Technical Manual table below warp 9', () => {
    expect( warpToC( 1 ) ).toBeCloseTo( 1, 6 );
    expect( warpToC( 2 ) ).toBeCloseTo( 10, 0 );
    expect( warpToC( 6 ) ).toBeCloseTo( 392, 0 );
    expect( warpToC( 8 ) ).toBeCloseTo( 1024, -1 );
  } );

  it( 'lands within the manual rounding at warp 9', () => {
    // The manual prints 1516c; 9^(10/3) is 1519c. We keep the formula so the
    // piecewise function is continuous, and accept the 0.2% disagreement.
    expect( warpToC( 9 ) ).toBeCloseTo( 1516, -1 );
  } );

  it( 'hits the published anchors above warp 9 exactly', () => {
    expect( warpToC( WARP_MAX_CRUISE ) ).toBeCloseTo( 1649, 6 );
    expect( warpToC( WARP_MAX_RATED ) ).toBeCloseTo( 1909, 6 );
    expect( warpToC( 9.9 ) ).toBeCloseTo( 3053, 6 );
  } );

  it( 'is continuous across warp 9', () => {
    const below = warpToC( 8.9999 );
    const at = warpToC( 9 );
    const above = warpToC( 9.0001 );

    expect( Math.abs( at - below ) ).toBeLessThan( 1 );
    expect( Math.abs( above - at ) ).toBeLessThan( 1 );
  } );

  it( 'is monotonically increasing', () => {
    let previous = 0;

    for ( let w = 1; w < 9.7; w += 0.05 ) {
      const v = warpToC( w );

      expect( v ).toBeGreaterThan( previous );
      previous = v;
    }
  } );

  it( 'rejects factors outside the TNG scale', () => {
    expect( warpToC( 0.9 ) ).toBeNaN();
    expect( warpToC( 10 ) ).toBeNaN();
    expect( warpToC( Number.POSITIVE_INFINITY ) ).toBeNaN();
    expect( warpToC( NaN ) ).toBeNaN();
  } );
} );

describe( 'transitDurationMs', () => {
  it( 'takes about 18.6 days to cross a sector at the default warp 6', () => {
    const days = transitDurationMs( 20, WARP_DEFAULT ) / DAY_MS;

    expect( days ).toBeCloseTo( 18.6, 1 );
  } );

  it( 'takes about 4.8 days to cross a sector at warp 9', () => {
    const days = transitDurationMs( 20, 9 ) / DAY_MS;

    expect( days ).toBeCloseTo( 4.8, 1 );
  } );

  it( 'takes about 4h35m to cover a light year at warp 9.6', () => {
    const hours = transitDurationMs( 1, WARP_MAX_RATED ) / HOUR_MS;

    expect( hours ).toBeCloseTo( 4.59, 1 );
  } );

  it( 'scales linearly with distance', () => {
    expect( transitDurationMs( 10, 6 ) ).toBeCloseTo( transitDurationMs( 5, 6 ) * 2, 6 );
  } );

  it( 'is NaN for an unusable warp factor', () => {
    expect( transitDurationMs( 10, 11 ) ).toBeNaN();
  } );
} );

describe( 'highWarpRangeLimitLy', () => {
  it( 'buys about 2.6 ly at warp 9.6 within the twelve-hour rule', () => {
    expect( highWarpRangeLimitLy( WARP_MAX_RATED ) ).toBeCloseTo( 2.61, 1 );
  } );

  it( 'agrees with a twelve-hour transit at the same warp factor', () => {
    const limit = highWarpRangeLimitLy( 9.4 );

    expect( transitDurationMs( limit, 9.4 ) ).toBeCloseTo( 12 * HOUR_MS, 3 );
  } );
} );

describe( 'lyPerDay', () => {
  it( 'converts multiples of c into light years per day', () => {
    expect( lyPerDay( 1 ) ).toBeCloseTo( 1 / 365.25, 9 );
    expect( lyPerDay( WARP_DEFAULT ) ).toBeCloseTo( 392.4 / 365.25, 2 );
  } );
} );

describe( 'lerp', () => {
  const from = { x: 0, y: 0, z: 0 };
  const to = { x: 10, y: 20, z: -30 };

  it( 'returns the endpoints at t = 0 and t = 1', () => {
    expect( lerp( from, to, 0 ) ).toEqual( from );
    expect( lerp( from, to, 1 ) ).toEqual( to );
  } );

  it( 'interpolates at the midpoint', () => {
    expect( lerp( from, to, 0.5 ) ).toEqual( { x: 5, y: 10, z: -15 } );
  } );

  it( 'clamps rather than overshooting', () => {
    expect( lerp( from, to, 2 ) ).toEqual( to );
    expect( lerp( from, to, -1 ) ).toEqual( from );
  } );
} );

describe( 'distances', () => {
  it( 'puts Sol 30,000 ly from the core', () => {
    expect( distanceFromCore( SOL ) ).toBe( 30000 );
    expect( distanceFromSol( SOL ) ).toBe( 0 );
  } );
} );

describe( 'checkCourseOrder', () => {
  const order = ( over: Partial<Parameters<typeof checkCourseOrder>[0]> = {} ) => ( {
    bearing: 0,
    mark: 0,
    distanceLy: 1,
    warpFactor: WARP_DEFAULT,
    ...over
  } );

  const asCrew = { isOfficer: false };
  const asOfficer = { isOfficer: true };

  it( 'accepts an ordinary cruise order from anyone', () => {
    expect( checkCourseOrder( order(), asCrew ).ok ).toBe( true );
  } );

  it( 'rejects a bearing outside 0-359.9', () => {
    expect( checkCourseOrder( order( { bearing: -1 } ), asCrew ) ).toMatchObject( {
      ok: false, reason: { code: 'invalid-bearing' }
    } );
    expect( checkCourseOrder( order( { bearing: 360 } ), asCrew ) ).toMatchObject( {
      ok: false, reason: { code: 'invalid-bearing' }
    } );
    expect( checkCourseOrder( order( { bearing: NaN } ), asCrew ) ).toMatchObject( {
      ok: false, reason: { code: 'invalid-bearing' }
    } );
  } );

  it( 'rejects a mark outside 0-359.9', () => {
    expect( checkCourseOrder( order( { mark: 360 } ), asCrew ) ).toMatchObject( {
      ok: false, reason: { code: 'invalid-mark' }
    } );
  } );

  it( 'rejects a zero, negative or absurd distance', () => {
    for ( const distanceLy of [0, -5, MAX_COURSE_DISTANCE_LY + 1, Number.POSITIVE_INFINITY] ) {
      expect( checkCourseOrder( order( { distanceLy } ), asCrew ) ).toMatchObject( {
        ok: false, reason: { code: 'invalid-distance' }
      } );
    }
  } );

  it( 'accepts the distance cap exactly', () => {
    expect( checkCourseOrder(
      order( { distanceLy: MAX_COURSE_DISTANCE_LY } ), asCrew
    ).ok ).toBe( true );
  } );

  it( 'lets anyone order up to warp 9.0', () => {
    expect( checkCourseOrder( order( { warpFactor: WARP_OPEN_MAX } ), asCrew ).ok ).toBe( true );
  } );

  it( 'refuses above warp 9.0 without officer authority', () => {
    expect( checkCourseOrder( order( { warpFactor: 9.1 } ), asCrew ) ).toMatchObject( {
      ok: false, reason: { code: 'high-warp-restricted', threshold: WARP_OPEN_MAX }
    } );
  } );

  it( 'allows an officer above warp 9.0', () => {
    expect( checkCourseOrder( order( { warpFactor: 9.1 } ), asOfficer ).ok ).toBe( true );
  } );

  it( 'refuses above the rated maximum for everyone, officers included', () => {
    for ( const opts of [asCrew, asOfficer] ) {
      expect( checkCourseOrder( order( { warpFactor: 9.7 } ), opts ) ).toMatchObject( {
        ok: false, reason: { code: 'warp-out-of-range', maxWarp: WARP_MAX_RATED }
      } );
    }
  } );

  it( 'accepts the rated maximum exactly, for an officer', () => {
    expect( checkCourseOrder(
      order( { warpFactor: WARP_MAX_RATED, distanceLy: 2 } ), asOfficer
    ).ok ).toBe( true );
  } );

  it( 'refuses warp below 1', () => {
    expect( checkCourseOrder( order( { warpFactor: 0.5 } ), asOfficer ) ).toMatchObject( {
      ok: false, reason: { code: 'warp-out-of-range' }
    } );
  } );

  describe( 'the twelve-hour rule', () => {
    it( 'allows a short hop at the rated maximum', () => {
      expect( checkCourseOrder(
        order( { warpFactor: WARP_MAX_RATED, distanceLy: 2 } ), asOfficer
      ).ok ).toBe( true );
    } );

    it( 'refuses a run that would exceed twelve hours above maximum cruise', () => {
      expect( checkCourseOrder(
        order( { warpFactor: WARP_MAX_RATED, distanceLy: 5 } ), asOfficer
      ) ).toMatchObject( {
        ok: false,
        reason: { code: 'high-warp-duration', alternativeWarp: WARP_MAX_CRUISE }
      } );
    } );

    it( 'does not bite at or below maximum cruise', () => {
      expect( checkCourseOrder(
        order( { warpFactor: WARP_MAX_CRUISE, distanceLy: 5 } ), asOfficer
      ).ok ).toBe( true );
      expect( checkCourseOrder(
        order( { warpFactor: WARP_MAX_CRUISE, distanceLy: 500 } ), asOfficer
      ).ok ).toBe( true );
    } );

    it( 'reports a limit that is itself acceptable', () => {
      const refused = checkCourseOrder(
        order( { warpFactor: WARP_MAX_RATED, distanceLy: 5 } ), asOfficer
      );

      if ( refused.ok || refused.reason.code !== 'high-warp-duration' ) {
        throw new Error( 'expected a high-warp-duration refusal' );
      }

      // Just under the reported limit must pass, or the advice is a lie.
      expect( checkCourseOrder(
        order( { warpFactor: WARP_MAX_RATED, distanceLy: refused.reason.limitLy * 0.99 } ),
        asOfficer
      ).ok ).toBe( true );
    } );
  } );

  it( 'checks the ceiling before the officer gate', () => {
    // 9.7 is beyond the ship, not beyond the rank - the reason must say so.
    const refused = checkCourseOrder( order( { warpFactor: 9.7 } ), asCrew );

    expect( refused.ok ).toBe( false );
    if ( !refused.ok ) expect( refused.reason.code ).toBe( 'warp-out-of-range' );
  } );
} );

describe( 'velocityBand', () => {
  it( 'bands by the Technical Manual thresholds', () => {
    expect( velocityBand( 1 ) ).toBe( 'cruise' );
    expect( velocityBand( WARP_DEFAULT ) ).toBe( 'cruise' );
    expect( velocityBand( 6.1 ) ).toBe( 'above-cruise' );
    expect( velocityBand( WARP_OPEN_MAX ) ).toBe( 'above-cruise' );
    expect( velocityBand( 9.1 ) ).toBe( 'high-warp' );
    expect( velocityBand( WARP_MAX_RATED ) ).toBe( 'high-warp' );
  } );
} );

describe( 'checkSpeedChange', () => {
  const order = ( over: Partial<Parameters<typeof checkSpeedChange>[0]> = {} ) => ( {
    remainingLy: 10,
    currentWarp: WARP_DEFAULT,
    warpFactor: 8,
    ...over
  } );

  const asCrew = { isOfficer: false };
  const asOfficer = { isOfficer: true };

  it( 'accepts an ordinary change of velocity', () => {
    expect( checkSpeedChange( order(), asCrew ).ok ).toBe( true );
  } );

  it( 'accepts slowing down as readily as speeding up', () => {
    expect( checkSpeedChange(
      order( { currentWarp: 9, warpFactor: 2 } ), asCrew
    ).ok ).toBe( true );
  } );

  it( 'lets a non-officer slow down from an officer-ordered high warp', () => {
    // The gate is on the target velocity, so reducing speed is never blocked -
    // which is the right way round for a safety action.
    expect( checkSpeedChange(
      order( { currentWarp: WARP_MAX_RATED, warpFactor: WARP_DEFAULT } ), asCrew
    ).ok ).toBe( true );
  } );

  it( 'refuses a change to the velocity already set', () => {
    expect( checkSpeedChange(
      order( { currentWarp: 7, warpFactor: 7 } ), asOfficer
    ) ).toMatchObject( {
      ok: false, reason: { code: 'same-velocity', warpFactor: 7 }
    } );
  } );

  it( 'applies the same officer gate as ordering a course', () => {
    // Otherwise warp 6 then a bump to 9.5 is a free way around the check.
    expect( checkSpeedChange( order( { warpFactor: 9.5 } ), asCrew ) ).toMatchObject( {
      ok: false, reason: { code: 'high-warp-restricted', threshold: WARP_OPEN_MAX }
    } );
    expect( checkSpeedChange( order( { warpFactor: 9.5, remainingLy: 2 } ), asOfficer ).ok )
      .toBe( true );
  } );

  it( 'refuses above the rated maximum for everyone', () => {
    for ( const opts of [asCrew, asOfficer] ) {
      expect( checkSpeedChange( order( { warpFactor: 9.7 } ), opts ) ).toMatchObject( {
        ok: false, reason: { code: 'warp-out-of-range' }
      } );
    }
  } );

  it( 'measures the twelve-hour rule against the distance still to run', () => {
    // 5 ly remaining is too far at warp 9.6; 2 ly is not. The distance already
    // covered is irrelevant - the clock restarts at the change.
    expect( checkSpeedChange(
      order( { remainingLy: 5, warpFactor: WARP_MAX_RATED } ), asOfficer
    ) ).toMatchObject( {
      ok: false, reason: { code: 'high-warp-duration' }
    } );

    expect( checkSpeedChange(
      order( { remainingLy: 2, warpFactor: WARP_MAX_RATED } ), asOfficer
    ).ok ).toBe( true );
  } );

  it( 'does not apply the twelve-hour rule at or below maximum cruise', () => {
    expect( checkSpeedChange(
      order( { remainingLy: 500, warpFactor: WARP_MAX_CRUISE } ), asOfficer
    ).ok ).toBe( true );
  } );
} );
