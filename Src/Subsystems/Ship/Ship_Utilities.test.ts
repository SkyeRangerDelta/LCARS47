// -- Ship Position Utilities Tests --
// The resolver is the piece worth testing hardest: it is the only thing that
// knows where the ship is mid-voyage, and nothing else ever writes that down.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { MongoClient } from 'mongodb';

import {
  SEED_ANCHORAGE,
  arrivalDue,
  getShipPosition,
  planCourse,
  planSpeedChange,
  resolveShipPosition,
  setCourse,
  settleAt,
  voyageDepartedAt,
  voyageDistanceLy,
  voyageRunBeforeLeg
} from './Ship_Utilities.js';
import {
  SOL,
  WARP_DEFAULT,
  distance,
  transitDurationMs
} from './Ship_Navigation.js';
import type { ShipPosition, TransitPlan } from '../Auxiliary/Interfaces/ShipInterfaces.js';

beforeAll( () => {
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'warn' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

// -- Fakes --

interface UpdateCall {
  filter: unknown
  update: unknown
  options: unknown
}

/**
 * Minimal stand-in for the one collection Ship_Utilities touches. Only the
 * three methods it actually calls are implemented, so an unexpected call is a
 * type error rather than a silent pass.
 */
function fakeConnection( initial: ShipPosition | null ) {
  let stored = initial;
  const updates: UpdateCall[] = [];

  const collection = {
    findOne: vi.fn( () => Promise.resolve( stored ) ),
    insertOne: vi.fn( ( doc: ShipPosition ) => {
      stored = doc;
      return Promise.resolve( { acknowledged: true } );
    } ),
    updateOne: vi.fn( ( filter: unknown, update: unknown, options: unknown ) => {
      updates.push( { filter, update, options } );
      return Promise.resolve( { acknowledged: true } );
    } )
  };

  const connection = {
    db: () => ( { collection: () => collection } )
  } as unknown as MongoClient;

  return { connection, collection, updates };
}

const ORIGIN = { ...SOL };
const DESTINATION = { x: SOL.x - 20, y: 0, z: 0 };
const DEPARTED = Date.UTC( 2026, 7, 1, 12, 0, 0 );
const DURATION = transitDurationMs( 20, WARP_DEFAULT );

function transitPlan( over: Partial<TransitPlan> = {} ): TransitPlan {
  return {
    origin: ORIGIN,
    destination: DESTINATION,
    bearing: 0,
    mark: 0,
    distanceLy: 20,
    warpFactor: WARP_DEFAULT,
    departedAt: new Date( DEPARTED ),
    etaAt: new Date( DEPARTED + DURATION ),
    orderedBy: '1234567890',
    ...over
  };
}

function transitDoc( over: Partial<TransitPlan> = {} ): ShipPosition {
  return {
    id: 1,
    status: 'transit',
    position: ORIGIN,
    transit: transitPlan( over ),
    updatedAt: new Date( DEPARTED ),
    updatedBy: '1234567890'
  };
}

const mooredDoc: ShipPosition = {
  id: 1,
  status: 'orbit',
  position: { ...SOL },
  anchorage: SEED_ANCHORAGE,
  updatedAt: new Date( DEPARTED ),
  updatedBy: 'system'
};

// -- Tests --

describe( 'getShipPosition', () => {
  it( 'seeds Earth orbit in Sector 001 on first ever read', async () => {
    const { connection, collection } = fakeConnection( null );

    const doc = await getShipPosition( connection );

    expect( doc.status ).toBe( 'orbit' );
    expect( doc.anchorage ).toBe( SEED_ANCHORAGE );
    expect( doc.position ).toEqual( SOL );
    expect( doc.id ).toBe( 1 );
    expect( collection.insertOne ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'returns the stored document without reseeding', async () => {
    const { connection, collection } = fakeConnection( mooredDoc );

    const doc = await getShipPosition( connection );

    expect( doc ).toBe( mooredDoc );
    expect( collection.insertOne ).not.toHaveBeenCalled();
  } );
} );

describe( 'resolveShipPosition', () => {
  it( 'passes a moored ship straight through', () => {
    const resolved = resolveShipPosition( mooredDoc, DEPARTED );

    expect( resolved.status ).toBe( 'orbit' );
    expect( resolved.position ).toEqual( SOL );
    expect( resolved.anchorage ).toBe( SEED_ANCHORAGE );
    expect( resolved.transit ).toBeUndefined();
  } );

  it( 'derives the sector address for whatever position it reports', () => {
    const resolved = resolveShipPosition( mooredDoc, DEPARTED );

    expect( resolved.sector.designation ).toBe( '001' );
    expect( resolved.sector.quadrant ).toBe( 'Alpha' );
    expect( resolved.distanceFromCoreLy ).toBe( 30000 );
    expect( resolved.distanceFromSolLy ).toBe( 0 );
  } );

  it( 'sits at the origin at the moment of departure', () => {
    const resolved = resolveShipPosition( transitDoc(), DEPARTED );

    expect( resolved.status ).toBe( 'transit' );
    expect( resolved.position ).toEqual( ORIGIN );
    expect( resolved.transit?.progress ).toBe( 0 );
    expect( resolved.transit?.travelledLy ).toBe( 0 );
    expect( resolved.transit?.remainingLy ).toBe( 20 );
  } );

  it( 'interpolates to the midpoint halfway through', () => {
    const resolved = resolveShipPosition( transitDoc(), DEPARTED + DURATION / 2 );

    expect( resolved.status ).toBe( 'transit' );
    expect( resolved.position.x ).toBeCloseTo( SOL.x - 10, 6 );
    expect( resolved.transit?.progress ).toBeCloseTo( 0.5, 9 );
    expect( resolved.transit?.travelledLy ).toBeCloseTo( 10, 6 );
    expect( resolved.transit?.remainingLy ).toBeCloseTo( 10, 6 );
    expect( resolved.transit?.remainingMs ).toBeCloseTo( DURATION / 2, 0 );
  } );

  it( 'reports arrival as idle at the destination once the ETA passes', () => {
    const resolved = resolveShipPosition( transitDoc(), DEPARTED + DURATION );

    expect( resolved.status ).toBe( 'idle' );
    expect( resolved.position ).toEqual( DESTINATION );
    expect( resolved.transit ).toBeUndefined();
    expect( resolved.anchorage ).toBeUndefined();
  } );

  it( 'clamps rather than overshooting long after the ETA', () => {
    const resolved = resolveShipPosition( transitDoc(), DEPARTED + DURATION * 10 );

    expect( resolved.status ).toBe( 'idle' );
    expect( resolved.position ).toEqual( DESTINATION );
  } );

  it( 'clamps rather than reversing before the departure', () => {
    const resolved = resolveShipPosition( transitDoc(), DEPARTED - DURATION );

    expect( resolved.position ).toEqual( ORIGIN );
    expect( resolved.transit?.progress ).toBe( 0 );
  } );

  it( 'treats a zero-length voyage as already arrived', () => {
    const doc = transitDoc( { etaAt: new Date( DEPARTED ) } );

    expect( resolveShipPosition( doc, DEPARTED ).status ).toBe( 'idle' );
  } );

  it( 'ignores a transit status with no plan attached', () => {
    const broken: ShipPosition = { ...mooredDoc, status: 'transit', transit: undefined };

    expect( resolveShipPosition( broken, DEPARTED ).status ).toBe( 'transit' );
    expect( resolveShipPosition( broken, DEPARTED ).transit ).toBeUndefined();
  } );

  it( 'survives a restart: the same clock gives the same answer', () => {
    const at = DEPARTED + DURATION * 0.37;
    const first = resolveShipPosition( transitDoc(), at );
    const second = resolveShipPosition( transitDoc(), at );

    expect( first.position ).toEqual( second.position );
    expect( first.transit?.progress ).toBe( second.transit?.progress );
  } );
} );

describe( 'arrivalDue', () => {
  it( 'is false before the ETA and true after it', () => {
    const doc = transitDoc();

    expect( arrivalDue( doc, DEPARTED ) ).toBe( false );
    expect( arrivalDue( doc, DEPARTED + DURATION - 1 ) ).toBe( false );
    expect( arrivalDue( doc, DEPARTED + DURATION ) ).toBe( true );
  } );

  it( 'is false for a ship that is not under way', () => {
    expect( arrivalDue( mooredDoc, DEPARTED + DURATION * 10 ) ).toBe( false );
  } );
} );

describe( 'planCourse', () => {
  it( 'sets the ETA from the distance and warp factor', () => {
    const plan = planCourse( SOL, {
      bearing: 0,
      mark: 0,
      distanceLy: 20,
      warpFactor: WARP_DEFAULT,
      orderedBy: 'someone'
    }, DEPARTED );

    expect( plan.departedAt.getTime() ).toBe( DEPARTED );
    expect( plan.etaAt.getTime() - DEPARTED ).toBeCloseTo( DURATION, 0 );
  } );

  it( 'places the destination the ordered distance away', () => {
    const plan = planCourse( SOL, {
      bearing: 90,
      mark: 30,
      distanceLy: 7.5,
      warpFactor: WARP_DEFAULT,
      orderedBy: 'someone'
    }, DEPARTED );

    const dx = plan.destination.x - SOL.x;
    const dy = plan.destination.y - SOL.y;
    const dz = plan.destination.z - SOL.z;

    expect( Math.sqrt( dx * dx + dy * dy + dz * dz ) ).toBeCloseTo( 7.5, 9 );
  } );

  it( 'copies the origin rather than aliasing it', () => {
    const from = { ...SOL };
    const plan = planCourse( from, {
      bearing: 0, mark: 0, distanceLy: 1, warpFactor: WARP_DEFAULT, orderedBy: 'x'
    }, DEPARTED );

    expect( plan.origin ).not.toBe( from );
    expect( plan.origin ).toEqual( from );
  } );
} );

describe( 'setCourse', () => {
  it( 'stores the plan, upserts, and clears any anchorage', async () => {
    const { connection, updates } = fakeConnection( mooredDoc );
    const plan = transitPlan();

    const next = await setCourse( connection, plan );

    expect( next.status ).toBe( 'transit' );
    expect( next.transit ).toBe( plan );
    expect( next.position ).toEqual( ORIGIN );

    expect( updates ).toHaveLength( 1 );
    expect( updates[0].filter ).toEqual( { id: 1 } );
    expect( updates[0].options ).toEqual( { upsert: true } );
    expect( updates[0].update ).toMatchObject( { $unset: { anchorage: '' } } );
  } );
} );

describe( 'settleAt', () => {
  it( 'drops to idle and clears both the voyage and any anchorage', async () => {
    const { connection, updates } = fakeConnection( transitDoc() );

    const next = await settleAt( connection, DESTINATION, 'system' );

    expect( next.status ).toBe( 'idle' );
    expect( next.position ).toEqual( DESTINATION );
    expect( next.transit ).toBeUndefined();

    expect( updates[0].update ).toMatchObject( {
      $unset: { transit: '', anchorage: '' }
    } );
  } );

  it( 'copies the position rather than aliasing the caller', async () => {
    const { connection } = fakeConnection( transitDoc() );
    const target = { x: 1, y: 2, z: 3 };

    const next = await settleAt( connection, target, 'system' );

    expect( next.position ).not.toBe( target );
    expect( next.position ).toEqual( target );
  } );
} );

describe( 'planSpeedChange', () => {
  const CHANGED_AT = DEPARTED + DURATION / 2;
  const HALFWAY = { x: SOL.x - 10, y: 0, z: 0 };

  it( 'starts a fresh leg from where the ship has reached', () => {
    const next = planSpeedChange( transitPlan(), HALFWAY, 9, CHANGED_AT, 'someone' );

    expect( next.origin ).toEqual( HALFWAY );
    // Date truncates sub-millisecond input, and DURATION is not a whole number.
    expect( next.departedAt.getTime() ).toBeCloseTo( CHANGED_AT, 0 );
    expect( next.distanceLy ).toBeCloseTo( 10, 9 );
    expect( next.warpFactor ).toBe( 9 );
    expect( next.orderedBy ).toBe( 'someone' );
  } );

  it( 'leaves the destination exactly where it was', () => {
    const next = planSpeedChange( transitPlan(), HALFWAY, 9, CHANGED_AT, 'someone' );

    expect( next.destination ).toEqual( DESTINATION );
  } );

  it( 'recomputes the ETA at the new velocity, for the remaining distance', () => {
    const next = planSpeedChange( transitPlan(), HALFWAY, 9, CHANGED_AT, 'someone' );

    expect( next.etaAt.getTime() - CHANGED_AT )
      .toBeCloseTo( transitDurationMs( 10, 9 ), 0 );
  } );

  it( 'remembers where and when the voyage actually began', () => {
    const next = planSpeedChange( transitPlan(), HALFWAY, 9, CHANGED_AT, 'someone' );

    expect( next.voyageOrigin ).toEqual( ORIGIN );
    expect( voyageDepartedAt( next ).getTime() ).toBe( DEPARTED );
    expect( voyageRunBeforeLeg( next ) ).toBeCloseTo( 10, 9 );
    expect( voyageDistanceLy( next ) ).toBeCloseTo( 20, 9 );
  } );

  it( 'carries the original departure through a second speed change', () => {
    const first = planSpeedChange( transitPlan(), HALFWAY, 9, CHANGED_AT, 'someone' );
    const quarterLeft = { x: SOL.x - 15, y: 0, z: 0 };
    const second = planSpeedChange( first, quarterLeft, 4, CHANGED_AT + 1000, 'someone' );

    expect( second.voyageOrigin ).toEqual( ORIGIN );
    expect( voyageDepartedAt( second ).getTime() ).toBe( DEPARTED );
    expect( second.warpFactor ).toBe( 4 );
    expect( voyageDistanceLy( second ) ).toBeCloseTo( 20, 9 );
  } );

  it( 'recomputes the bearing, because the local frame rotates as the ship moves', () => {
    // Heading spinward rather than coreward, so the frame really does turn.
    const spinward = planCourse( SOL, {
      bearing: 90, mark: 0, distanceLy: 40, warpFactor: WARP_DEFAULT, orderedBy: 'x'
    }, DEPARTED );

    const partWay = { x: spinward.origin.x, y: spinward.origin.y - 20, z: 0 };
    const next = planSpeedChange( spinward, partWay, 8, CHANGED_AT, 'someone' );

    // Still pointing at the same destination, but no longer at exactly 090.
    expect( next.destination ).toEqual( spinward.destination );
    expect( next.bearing ).not.toBe( 90 );
    expect( next.bearing ).toBeCloseTo( 90, 1 );
  } );

  it( 'keeps the bearing at 000 when running straight down the Sol axis', () => {
    const next = planSpeedChange( transitPlan(), HALFWAY, 9, CHANGED_AT, 'someone' );

    expect( next.bearing ).toBeCloseTo( 0, 6 );
    expect( next.mark ).toBeCloseTo( 0, 6 );
  } );
} );

describe( 'resolveShipPosition across a speed change', () => {
  const CHANGED_AT = DEPARTED + DURATION / 2;
  const HALFWAY = { x: SOL.x - 10, y: 0, z: 0 };

  function afterChange(): ShipPosition {
    const next = planSpeedChange( transitPlan(), HALFWAY, 9, CHANGED_AT, 'someone' );

    return {
      id: 1,
      status: 'transit',
      position: { ...next.origin },
      transit: next,
      updatedAt: new Date( CHANGED_AT ),
      updatedBy: 'someone'
    };
  }

  it( 'does not let progress jump at the moment of the change', () => {
    // The single most important property here: a speed change must be invisible
    // to the progress bar, or the ship appears to teleport backwards.
    const before = resolveShipPosition( transitDoc(), CHANGED_AT - 1 );
    const after = resolveShipPosition( afterChange(), CHANGED_AT );

    expect( after.transit?.progress ).toBeCloseTo( before.transit?.progress ?? 0, 4 );
    expect( after.position.x ).toBeCloseTo( before.position.x, 4 );
  } );

  it( 'reports distances across the whole voyage, not just the current leg', () => {
    const at = resolveShipPosition( afterChange(), CHANGED_AT );

    expect( at.transit?.totalDistanceLy ).toBeCloseTo( 20, 6 );
    expect( at.transit?.travelledLy ).toBeCloseTo( 10, 6 );
    expect( at.transit?.remainingLy ).toBeCloseTo( 10, 6 );
    expect( at.transit?.progress ).toBeCloseTo( 0.5, 6 );
  } );

  it( 'keeps advancing correctly on the new leg', () => {
    const doc = afterChange();
    const legDuration = transitDurationMs( 10, 9 );
    const at = resolveShipPosition( doc, CHANGED_AT + legDuration / 2 );

    expect( at.transit?.travelledLy ).toBeCloseTo( 15, 6 );
    expect( at.transit?.remainingLy ).toBeCloseTo( 5, 6 );
    expect( at.transit?.progress ).toBeCloseTo( 0.75, 6 );
    expect( at.position.x ).toBeCloseTo( SOL.x - 15, 6 );
  } );

  it( 'arrives at the original destination, sooner than the first plan promised', () => {
    const doc = afterChange();
    const newEta = doc.transit?.etaAt.getTime() ?? 0;

    expect( newEta ).toBeLessThan( DEPARTED + DURATION );

    const at = resolveShipPosition( doc, newEta );
    expect( at.status ).toBe( 'idle' );
    expect( at.position ).toEqual( DESTINATION );
    expect( distance( at.position, DESTINATION ) ).toBe( 0 );
  } );

  it( 'reports the whole voyage as one leg when the speed was never changed', () => {
    const at = resolveShipPosition( transitDoc(), DEPARTED + DURATION / 4 );

    expect( at.transit?.totalDistanceLy ).toBeCloseTo( 20, 6 );
    expect( at.transit?.travelledLy ).toBeCloseTo( 5, 6 );
  } );

  it( 'handles a legacy plan with no voyage origin recorded', () => {
    // Documents written before speed changes existed have no voyageOrigin; they
    // must still resolve as a single-leg voyage rather than throwing.
    const legacy = transitDoc();
    delete legacy.transit?.voyageOrigin;
    delete legacy.transit?.voyageDepartedAt;

    const at = resolveShipPosition( legacy, DEPARTED + DURATION / 2 );

    expect( at.transit?.totalDistanceLy ).toBeCloseTo( 20, 6 );
    expect( at.transit?.progress ).toBeCloseTo( 0.5, 6 );
  } );
} );
