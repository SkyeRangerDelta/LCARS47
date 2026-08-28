// -- Ship Route Tests --
// Exercises the payload projection only. The express plumbing is one call to
// Ship_Utilities and a res.send; the shape is the part worth guarding.

import { describe, it, expect } from 'vitest';

import { buildShipResponse } from './ship.js';
import { SOL, WARP_DEFAULT, transitDurationMs } from '../../Ship/Ship_Navigation.js';
import {
  planCourseToPoint,
  planSpeedChange,
  resolveShipPosition
} from '../../Ship/Ship_Utilities.js';
import type { ShipPosition } from '../../Auxiliary/Interfaces/ShipInterfaces.js';

const DEPARTED = Date.UTC( 2026, 7, 1, 12, 0, 0 );
const DURATION = transitDurationMs( 20, WARP_DEFAULT );

const moored: ShipPosition = {
  id: 1,
  status: 'orbit',
  position: { ...SOL },
  anchorage: 'Earth',
  updatedAt: new Date( DEPARTED ),
  updatedBy: 'system'
};

const underway: ShipPosition = {
  id: 1,
  status: 'transit',
  position: { ...SOL },
  transit: {
    origin: { ...SOL },
    destination: { x: SOL.x - 20, y: 0, z: 0 },
    bearing: 0,
    mark: 0,
    distanceLy: 20,
    warpFactor: WARP_DEFAULT,
    departedAt: new Date( DEPARTED ),
    etaAt: new Date( DEPARTED + DURATION ),
    orderedBy: '1234567890'
  },
  updatedAt: new Date( DEPARTED ),
  updatedBy: '1234567890'
};

describe( 'buildShipResponse', () => {
  it( 'reports a moored ship with no voyage attached', () => {
    const body = buildShipResponse( resolveShipPosition( moored, DEPARTED ) );

    expect( body.STATUS ).toBe( 'orbit' );
    expect( body.QUADRANT ).toBe( 'Alpha' );
    expect( body.SECTOR.designation ).toBe( '001' );
    expect( body.ANCHORAGE ).toBe( 'Earth' );
    expect( body.TRANSIT ).toBeNull();
    expect( body.DISTANCE_FROM_CORE_LY ).toBe( 30000 );
    expect( body.DISTANCE_FROM_SOL_LY ).toBe( 0 );
  } );

  it( 'renders timestamps as ISO strings, not Date objects', () => {
    const body = buildShipResponse( resolveShipPosition( moored, DEPARTED ) );

    expect( typeof body.UPDATED_AT ).toBe( 'string' );
    expect( body.UPDATED_AT ).toBe( new Date( DEPARTED ).toISOString() );
  } );

  it( 'reports a voyage in progress with progress in [0, 1]', () => {
    const body = buildShipResponse(
      resolveShipPosition( underway, DEPARTED + DURATION / 4 )
    );

    expect( body.STATUS ).toBe( 'transit' );
    expect( body.TRANSIT ).not.toBeNull();
    expect( body.TRANSIT?.PROGRESS ).toBeGreaterThan( 0 );
    expect( body.TRANSIT?.PROGRESS ).toBeLessThan( 1 );
    expect( body.TRANSIT?.WARP_FACTOR ).toBe( WARP_DEFAULT );
    expect( body.TRANSIT?.TRAVELLED_LY ).toBeCloseTo( 5, 6 );
    expect( body.TRANSIT?.REMAINING_LY ).toBeCloseTo( 15, 6 );
    expect( typeof body.TRANSIT?.ETA_AT ).toBe( 'string' );
  } );

  it( 'holds the origin and destination fixed while the position advances', () => {
    const early = buildShipResponse( resolveShipPosition( underway, DEPARTED + DURATION / 4 ) );
    const later = buildShipResponse( resolveShipPosition( underway, DEPARTED + DURATION / 2 ) );

    expect( early.TRANSIT?.ORIGIN ).toEqual( later.TRANSIT?.ORIGIN );
    expect( early.TRANSIT?.DESTINATION ).toEqual( later.TRANSIT?.DESTINATION );
    expect( later.POSITION.x ).toBeLessThan( early.POSITION.x );
  } );

  it( 'drops the voyage once the ETA has passed', () => {
    const body = buildShipResponse( resolveShipPosition( underway, DEPARTED + DURATION ) );

    expect( body.STATUS ).toBe( 'idle' );
    expect( body.TRANSIT ).toBeNull();
    expect( body.ANCHORAGE ).toBeNull();
    expect( body.POSITION.x ).toBeCloseTo( SOL.x - 20, 6 );
  } );

  it( 'survives a JSON round trip', () => {
    const body = buildShipResponse( resolveShipPosition( underway, DEPARTED + DURATION / 3 ) );
    const parsed = JSON.parse( JSON.stringify( body ) ) as typeof body;

    expect( parsed ).toEqual( body );
  } );
} );

describe( 'buildShipResponse after a speed change', () => {
  const CHANGED_AT = DEPARTED + DURATION / 2;
  const HALFWAY = { x: SOL.x - 10, y: 0, z: 0 };

  function changedDoc(): ShipPosition {
    if ( underway.transit == null ) throw new Error( 'expected a voyage' );

    const next = planSpeedChange( underway.transit, HALFWAY, 9, CHANGED_AT, 'someone' );

    return {
      id: 1,
      status: 'transit',
      position: { ...next.origin },
      transit: next,
      updatedAt: new Date( CHANGED_AT ),
      updatedBy: 'someone'
    };
  }

  it( 'reports the whole voyage in the unprefixed fields', () => {
    const body = buildShipResponse( resolveShipPosition( changedDoc(), CHANGED_AT ) );

    expect( body.TRANSIT?.DISTANCE_LY ).toBeCloseTo( 20, 6 );
    expect( body.TRANSIT?.TRAVELLED_LY ).toBeCloseTo( 10, 6 );
    expect( body.TRANSIT?.PROGRESS ).toBeCloseTo( 0.5, 6 );
    expect( body.TRANSIT?.ORIGIN ).toEqual( { ...SOL } );
    expect( body.TRANSIT?.DEPARTED_AT ).toBe( new Date( DEPARTED ).toISOString() );
  } );

  it( 'reports the current leg in the LEG_ fields', () => {
    const body = buildShipResponse( resolveShipPosition( changedDoc(), CHANGED_AT ) );

    expect( body.TRANSIT?.LEG_ORIGIN ).toEqual( HALFWAY );
    expect( body.TRANSIT?.LEG_DISTANCE_LY ).toBeCloseTo( 10, 6 );
    expect( body.TRANSIT?.LEG_DEPARTED_AT ).not.toBe( body.TRANSIT?.DEPARTED_AT );
  } );

  it( 'reports the new velocity and an earlier arrival', () => {
    const body = buildShipResponse( resolveShipPosition( changedDoc(), CHANGED_AT ) );
    const original = buildShipResponse( resolveShipPosition( underway, DEPARTED ) );

    expect( body.TRANSIT?.WARP_FACTOR ).toBe( 9 );
    expect( Date.parse( body.TRANSIT?.ETA_AT ?? '' ) )
      .toBeLessThan( Date.parse( original.TRANSIT?.ETA_AT ?? '' ) );
  } );

  it( 'keeps leg and voyage fields identical when the speed was never changed', () => {
    const body = buildShipResponse( resolveShipPosition( underway, DEPARTED + DURATION / 4 ) );

    expect( body.TRANSIT?.LEG_ORIGIN ).toEqual( body.TRANSIT?.ORIGIN );
    expect( body.TRANSIT?.LEG_DISTANCE_LY ).toBe( body.TRANSIT?.DISTANCE_LY );
    expect( body.TRANSIT?.LEG_DEPARTED_AT ).toBe( body.TRANSIT?.DEPARTED_AT );
  } );
} );

describe( 'buildShipResponse destination naming', () => {
  it( 'reports null for a course laid in on a bearing', () => {
    const body = buildShipResponse( resolveShipPosition( underway, DEPARTED + 1 ) );

    expect( body.TRANSIT?.DESTINATION_NAME ).toBeNull();
  } );

  it( 'reports the name for a course laid in against a named point', () => {
    const target = { x: SOL.x - 20, y: 0, z: 0 };
    const plan = planCourseToPoint( SOL, target, {
      warpFactor: WARP_DEFAULT, orderedBy: 'someone', destinationName: 'Sol'
    }, DEPARTED );

    const doc: ShipPosition = {
      id: 1,
      status: 'transit',
      position: { ...SOL },
      transit: plan,
      updatedAt: new Date( DEPARTED ),
      updatedBy: 'someone'
    };

    const body = buildShipResponse( resolveShipPosition( doc, DEPARTED + 1 ) );

    expect( body.TRANSIT?.DESTINATION_NAME ).toBe( 'Sol' );
    expect( body.TRANSIT?.DESTINATION ).toEqual( target );
  } );
} );
