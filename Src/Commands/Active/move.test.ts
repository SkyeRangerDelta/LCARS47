// -- Move Command Tests --
// Embed layout only. The interaction plumbing is a switch and a deferReply; the
// numbers and wording a reader actually sees are the part worth guarding.

import { describe, it, expect } from 'vitest';
import type { EmbedBuilder } from 'discord.js';

import {
  buildDepartureEmbed,
  buildRefusalEmbed,
  buildSpeedChangeEmbed,
  buildStatusEmbed,
  buildUnderwayRefusalEmbed
} from './move.js';
import {
  SOL,
  WARP_DEFAULT,
  WARP_MAX_CRUISE,
  WARP_MAX_RATED,
  WARP_OPEN_MAX,
  transitDurationMs
} from '../../Subsystems/Ship/Ship_Navigation.js';
import {
  planCourseToPoint,
  planSpeedChange,
  resolveShipPosition
} from '../../Subsystems/Ship/Ship_Utilities.js';
import {
  COLOUR_REFUSED,
  COLOUR_STATION,
  COLOUR_TRANSIT
} from '../../Subsystems/Ship/Ship_Messages.js';
import type {
  ShipPosition,
  TransitPlan
} from '../../Subsystems/Auxiliary/Interfaces/ShipInterfaces.js';

const DEPARTED = Date.UTC( 2026, 7, 1, 12, 0, 0 );
const DURATION = transitDurationMs( 20, WARP_DEFAULT );

const fieldValue = ( embed: EmbedBuilder, name: string ): string | undefined =>
  embed.data.fields?.find( f => f.name === name )?.value;

const plan: TransitPlan = {
  origin: { ...SOL },
  destination: { x: SOL.x - 20, y: 0, z: 0 },
  bearing: 45,
  mark: 12,
  distanceLy: 20,
  warpFactor: WARP_DEFAULT,
  departedAt: new Date( DEPARTED ),
  etaAt: new Date( DEPARTED + DURATION ),
  orderedBy: '1234567890'
};

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
  transit: plan,
  updatedAt: new Date( DEPARTED ),
  updatedBy: '1234567890'
};

describe( 'buildStatusEmbed', () => {
  it( 'reports a moored ship in blue with its anchorage', () => {
    const embed = buildStatusEmbed( resolveShipPosition( moored, DEPARTED ) );

    expect( embed.data.title ).toContain( 'Standard orbit' );
    expect( embed.data.color ).toBe( COLOUR_STATION );
    expect( fieldValue( embed, 'Position' ) ).toBe( 'Sector 001 · Alpha Quadrant' );
    expect( fieldValue( embed, 'Anchorage' ) ).toBe( 'Earth' );
    expect( fieldValue( embed, 'Sol' ) ).toBe( '0.00 ly' );
  } );

  it( 'omits the anchorage field when there is nothing to be moored to', () => {
    const adrift: ShipPosition = { ...moored, status: 'idle', anchorage: undefined };
    const embed = buildStatusEmbed( resolveShipPosition( adrift, DEPARTED ) );

    expect( fieldValue( embed, 'Anchorage' ) ).toBeUndefined();
    expect( embed.data.title ).toContain( 'Station-keeping' );
  } );

  it( 'reports a ship under way in amber, with progress and course', () => {
    const embed = buildStatusEmbed(
      resolveShipPosition( underway, DEPARTED + DURATION / 2 )
    );

    expect( embed.data.color ).toBe( COLOUR_TRANSIT );
    expect( embed.data.description ).toContain( '045 mark 12' );
    expect( embed.data.description ).toContain( 'warp 6' );
    expect( fieldValue( embed, 'Progress' ) ).toContain( '50%' );
    expect( fieldValue( embed, 'Run' ) ).toContain( '10.00 of 20.00 ly' );
  } );

  it( 'drops the voyage fields once the ship has arrived', () => {
    const embed = buildStatusEmbed( resolveShipPosition( underway, DEPARTED + DURATION ) );

    expect( fieldValue( embed, 'Progress' ) ).toBeUndefined();
    expect( embed.data.color ).toBe( COLOUR_STATION );
  } );

  it( 'stays within the embed field limit', () => {
    const embed = buildStatusEmbed( resolveShipPosition( underway, DEPARTED + 1 ) );

    expect( embed.data.fields?.length ?? 0 ).toBeLessThanOrEqual( 25 );
  } );
} );

describe( 'buildDepartureEmbed', () => {
  const from = resolveShipPosition( moored, DEPARTED );

  it( 'confirms the course, velocity and duration', () => {
    const embed = buildDepartureEmbed( plan, from, 'Skye' );

    expect( embed.data.title ).toBe( '🚀 Course Laid In' );
    expect( embed.data.color ).toBe( COLOUR_TRANSIT );
    expect( fieldValue( embed, 'Course' ) ).toBe( '045 mark 12' );
    expect( fieldValue( embed, 'Velocity' ) ).toBe( 'warp 6 — Normal cruise' );
    expect( fieldValue( embed, 'Distance' ) ).toBe( '20.00 ly' );
    expect( fieldValue( embed, 'Departing' ) ).toBe( 'Sector 001 · Alpha Quadrant' );
    expect( fieldValue( embed, 'Duration' ) ).toMatch( /^18d/ );
  } );

  it( 'credits whoever gave the order', () => {
    const embed = buildDepartureEmbed( plan, from, 'Skye' );

    expect( embed.data.footer?.text ).toContain( 'Ordered by Skye' );
  } );

  it( 'adds no engineering note at normal cruise', () => {
    const embed = buildDepartureEmbed( plan, from, 'Skye' );

    expect( fieldValue( embed, 'Engineering' ) ).toBeUndefined();
  } );

  it( 'warns about elevated draw above normal cruise', () => {
    const embed = buildDepartureEmbed(
      { ...plan, warpFactor: 8.5 }, from, 'Skye'
    );

    expect( fieldValue( embed, 'Engineering' ) ).toContain( 'deflector generators' );
  } );

  it( 'warns about structural stress and the twelve-hour limit at high warp', () => {
    const embed = buildDepartureEmbed(
      { ...plan, warpFactor: WARP_MAX_RATED }, from, 'Skye'
    );

    expect( fieldValue( embed, 'Velocity' ) ).toContain( 'High warp' );
    expect( fieldValue( embed, 'Engineering' ) ).toContain( 'twelve hours' );
    expect( fieldValue( embed, 'Engineering' ) ).toContain( 'All three deflector generators' );
  } );
} );

describe( 'buildUnderwayRefusalEmbed', () => {
  it( 'refuses in red and shows how far along the voyage is', () => {
    const embed = buildUnderwayRefusalEmbed(
      resolveShipPosition( underway, DEPARTED + DURATION / 4 )
    );

    expect( embed.data.title ).toBe( '🚫 Course Change Refused' );
    expect( embed.data.color ).toBe( COLOUR_REFUSED );
    expect( fieldValue( embed, 'Progress' ) ).toContain( '25%' );
    expect( fieldValue( embed, 'Arrival' ) ).toMatch( /^<t:\d+:R>$/ );
  } );

  it( 'still renders when there is no voyage to describe', () => {
    const embed = buildUnderwayRefusalEmbed( resolveShipPosition( moored, DEPARTED ) );

    expect( embed.data.fields ?? [] ).toHaveLength( 0 );
    expect( embed.data.description ).toBeTruthy();
  } );
} );

describe( 'buildRefusalEmbed', () => {
  it( 'explains an out-of-range bearing', () => {
    const embed = buildRefusalEmbed( { code: 'invalid-bearing' }, 1 );

    expect( embed.data.color ).toBe( COLOUR_REFUSED );
    expect( embed.data.description ).toContain( '359.9' );
  } );

  it( 'explains an out-of-range mark', () => {
    expect( buildRefusalEmbed( { code: 'invalid-mark' }, 1 ).data.description )
      .toContain( 'Mark' );
  } );

  it( 'quotes the distance cap', () => {
    const embed = buildRefusalEmbed( { code: 'invalid-distance', maxLy: 5000 }, 0 );

    expect( embed.data.description ).toContain( '5000' );
  } );

  it( 'blames the ship, not the rank, above the rated maximum', () => {
    const embed = buildRefusalEmbed(
      { code: 'warp-out-of-range', maxWarp: WARP_MAX_RATED }, 1
    );

    expect( embed.data.description ).toContain( `warp ${ WARP_MAX_RATED }` );
    expect( embed.data.description ).toContain( 'whoever is asking' );
  } );

  it( 'names the authorisation needed for high warp', () => {
    const embed = buildRefusalEmbed(
      { code: 'high-warp-restricted', threshold: WARP_OPEN_MAX }, 1
    );

    expect( embed.data.description ).toContain( 'bridge officer authorisation' );
    expect( embed.data.description ).toContain( `warp ${ WARP_OPEN_MAX }` );
  } );

  it( 'offers a workable alternative when the twelve-hour rule bites', () => {
    const embed = buildRefusalEmbed( {
      code: 'high-warp-duration',
      limitLy: 2.61,
      alternativeWarp: WARP_MAX_CRUISE
    }, 5 );

    expect( embed.data.description ).toContain( 'twelve hours' );
    expect( fieldValue( embed, 'Maximum run at this velocity' ) ).toBe( '2.61 ly' );
    expect( fieldValue( embed, `At warp ${ WARP_MAX_CRUISE }` ) ).toBeTruthy();
  } );
} );

describe( 'buildSpeedChangeEmbed', () => {
  const CHANGED_AT = DEPARTED + DURATION / 2;
  const HALFWAY = { x: SOL.x - 10, y: 0, z: 0 };
  const before = resolveShipPosition( underway, CHANGED_AT ).transit;

  function change( toWarp: number ) {
    if ( before == null ) throw new Error( 'expected a voyage in progress' );
    return buildSpeedChangeEmbed(
      before.warpFactor,
      planSpeedChange( plan, HALFWAY, toWarp, CHANGED_AT, '1234567890' ),
      before,
      'Skye'
    );
  }

  it( 'reads as speeding up when the factor rises', () => {
    const embed = change( 9 );

    expect( embed.data.title ).toBe( '⏩ Ahead Faster' );
    expect( embed.data.color ).toBe( COLOUR_TRANSIT );
    expect( fieldValue( embed, 'Velocity' ) ).toContain( 'warp 6' );
    expect( fieldValue( embed, 'Velocity' ) ).toContain( 'warp 9' );
    expect( fieldValue( embed, 'Time saved' ) ).toBeTruthy();
  } );

  it( 'reads as slowing down when the factor falls', () => {
    const embed = change( 3 );

    expect( embed.data.title ).toBe( '⏪ Reducing Speed' );
    expect( fieldValue( embed, 'Time added' ) ).toBeTruthy();
    expect( fieldValue( embed, 'Time saved' ) ).toBeUndefined();
  } );

  it( 'says the heading is unchanged, and shows both arrival times', () => {
    const embed = change( 9 );

    expect( fieldValue( embed, 'Course' ) ).toContain( 'unchanged' );
    expect( fieldValue( embed, 'Was arriving' ) ).toMatch( /^<t:\d+:R>$/ );
    expect( fieldValue( embed, 'Now arriving' ) ).toContain( '<t:' );
  } );

  it( 'carries the progress made so far rather than resetting it', () => {
    expect( fieldValue( change( 9 ), 'Progress' ) ).toContain( '50%' );
  } );

  it( 'reports only the distance still to run', () => {
    expect( fieldValue( change( 9 ), 'Remaining' ) ).toBe( '10.00 ly' );
  } );

  it( 'warns about structural stress when changing up to high warp', () => {
    expect( fieldValue( change( 9.5 ), 'Engineering' ) ).toContain( 'twelve hours' );
  } );

  it( 'adds no engineering note when dropping back to normal cruise', () => {
    expect( fieldValue( change( 5 ), 'Engineering' ) ).toBeUndefined();
  } );
} );

describe( 'buildRefusalEmbed, speed cases', () => {
  it( 'says so when the ship is already at that velocity', () => {
    const embed = buildRefusalEmbed( { code: 'same-velocity', warpFactor: 7 }, 5 );

    expect( embed.data.description ).toContain( 'warp 7' );
  } );

  it( 'points at /move course when the ship is not under way', () => {
    const embed = buildRefusalEmbed( { code: 'not-under-way' }, 0 );

    expect( embed.data.description ).toContain( '/move course' );
  } );
} );

describe( 'named destinations in the embeds', () => {
  const TARGET = { x: SOL.x - 20, y: 0, z: 0 };
  const named = planCourseToPoint( SOL, TARGET, {
    warpFactor: WARP_DEFAULT, orderedBy: '1234567890', destinationName: 'Sol'
  }, DEPARTED );
  const from = resolveShipPosition( moored, DEPARTED );

  it( 'names the destination on departure', () => {
    const embed = buildDepartureEmbed( named, from, 'Skye' );

    expect( fieldValue( embed, 'Bound for' ) ).toContain( 'Sol' );
    expect( fieldValue( embed, 'Bound for' ) ).toContain( 'Sector' );
  } );

  it( 'falls back to the destination sector for a bearing course', () => {
    const embed = buildDepartureEmbed( plan, from, 'Skye' );
    const bound = fieldValue( embed, 'Bound for' );

    expect( bound ).toContain( 'Sector' );
    expect( bound ).not.toContain( '**' );
  } );

  it( 'keeps naming the destination in the status report', () => {
    const doc: ShipPosition = {
      id: 1,
      status: 'transit',
      position: { ...SOL },
      transit: named,
      updatedAt: new Date( DEPARTED ),
      updatedBy: '1234567890'
    };

    const embed = buildStatusEmbed( resolveShipPosition( doc, DEPARTED + DURATION / 2 ) );

    expect( fieldValue( embed, 'Bound for' ) ).toContain( 'Sol' );
  } );
} );

describe( 'buildRefusalEmbed, destination cases', () => {
  it( 'lists what it will accept when the destination is unknown', () => {
    const embed = buildRefusalEmbed( { code: 'unknown-destination', input: 'Qo\'noS' }, 0 );

    expect( embed.data.description ).toContain( 'Qo\'noS' );
    expect( embed.data.description ).toContain( '29980, 0, 0' );
  } );

  it( 'names the point when the ship is already there', () => {
    expect( buildRefusalEmbed( { code: 'already-there', name: 'Sol' }, 0 ).data.description )
      .toBe( 'We are already at Sol.' );
  } );

  it( 'falls back to coordinates when there is no name', () => {
    expect( buildRefusalEmbed( { code: 'already-there' }, 0 ).data.description )
      .toContain( 'those coordinates' );
  } );

  it( 'quotes the requested distance when a course is too long', () => {
    // Ordering a course for the galactic centre is 30,000 ly; the refusal is
    // only useful if it says so.
    const embed = buildRefusalEmbed( { code: 'invalid-distance', maxLy: 5000 }, 30000 );

    expect( embed.data.description ).toContain( '5000' );
    expect( embed.data.description ).toContain( '30000.00 ly' );
  } );
} );
