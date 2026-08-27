// -- ShipMonitor Tests --
// The property that matters is exactly-once: a voyage must be announced one
// time, however many sweeps run and however many times the bot restarts. That
// guarantee comes from the settle write, so the fake collection below actually
// applies updates rather than just recording them.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { MongoClient } from 'mongodb';

import { ShipMonitor } from './ShipMonitor.js';
import { SOL, WARP_DEFAULT, transitDurationMs } from '../Ship/Ship_Navigation.js';
import type { LCARSClient } from '../Auxiliary/LCARSClient.js';
import type { ShipPosition, TransitPlan } from '../Auxiliary/Interfaces/ShipInterfaces.js';

beforeAll( () => {
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'warn' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

const DEPARTED = Date.UTC( 2026, 7, 1, 12, 0, 0 );
const DURATION = transitDurationMs( 20, WARP_DEFAULT );
const ARRIVED = DEPARTED + DURATION;

const plan: TransitPlan = {
  origin: { ...SOL },
  destination: { x: SOL.x - 20, y: 0, z: 0 },
  bearing: 0,
  mark: 0,
  distanceLy: 20,
  warpFactor: WARP_DEFAULT,
  departedAt: new Date( DEPARTED ),
  etaAt: new Date( ARRIVED ),
  orderedBy: '1234567890'
};

function underwayDoc(): ShipPosition {
  return {
    id: 1,
    status: 'transit',
    position: { ...SOL },
    transit: plan,
    updatedAt: new Date( DEPARTED ),
    updatedBy: '1234567890'
  };
}

function mooredDoc(): ShipPosition {
  return {
    id: 1,
    status: 'orbit',
    position: { ...SOL },
    anchorage: 'Earth',
    updatedAt: new Date( DEPARTED ),
    updatedBy: 'system'
  };
}

interface MongoUpdate {
  $set?: Partial<ShipPosition>
  $unset?: Record<string, string>
}

/**
 * A collection that really applies $set and $unset, so a second sweep sees the
 * settled document rather than the original.
 */
function fakeConnection( initial: ShipPosition ) {
  let stored: ShipPosition = initial;

  const collection = {
    findOne: () => Promise.resolve( stored ),
    insertOne: ( doc: ShipPosition ) => {
      stored = doc;
      return Promise.resolve( { acknowledged: true } );
    },
    updateOne: ( _filter: unknown, update: MongoUpdate ) => {
      stored = { ...stored, ...( update.$set ?? {} ) };
      for ( const key of Object.keys( update.$unset ?? {} ) ) {
        delete ( stored as unknown as Record<string, unknown> )[key];
      }
      return Promise.resolve( { acknowledged: true } );
    }
  };

  const connection = {
    db: () => ( { collection: () => collection } )
  } as unknown as MongoClient;

  return { connection, current: () => stored };
}

function harness( doc: ShipPosition, now: number ) {
  const { connection, current } = fakeConnection( doc );
  const client = {} as LCARSClient;
  const sendFn = vi.fn( (): Promise<void> => Promise.resolve() );

  const monitor = new ShipMonitor( {
    client,
    connection,
    alertChannelId: 'channel',
    // Large enough that the interval never fires during a test; sweeps are
    // driven by hand.
    pollIntervalMs: 60 * 60_000,
    sendFn,
    nowFn: () => now
  } );

  return { monitor, sendFn, client, current };
}

describe( 'ShipMonitor.sweep', () => {
  it( 'says nothing while a voyage is still running', async () => {
    const { monitor, sendFn, client } = harness( underwayDoc(), DEPARTED + DURATION / 2 );

    await monitor.sweep();

    expect( sendFn ).not.toHaveBeenCalled();
    expect( client.SHIP_POSITION.status ).toBe( 'transit' );
  } );

  it( 'says nothing about a ship that is not under way', async () => {
    const { monitor, sendFn, client } = harness( mooredDoc(), ARRIVED + DURATION );

    await monitor.sweep();

    expect( sendFn ).not.toHaveBeenCalled();
    expect( client.SHIP_POSITION.status ).toBe( 'orbit' );
  } );

  it( 'settles the ship and announces once the ETA has passed', async () => {
    const { monitor, sendFn, client, current } = harness( underwayDoc(), ARRIVED );

    await monitor.sweep();

    expect( sendFn ).toHaveBeenCalledTimes( 1 );
    expect( client.SHIP_POSITION.status ).toBe( 'idle' );
    expect( client.SHIP_POSITION.position ).toEqual( plan.destination );
    expect( current().transit ).toBeUndefined();
  } );

  it( 'announces a voyage exactly once across repeated sweeps', async () => {
    const { monitor, sendFn } = harness( underwayDoc(), ARRIVED + DURATION );

    await monitor.sweep();
    await monitor.sweep();
    await monitor.sweep();

    expect( sendFn ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'closes out a voyage that finished while the bot was down', async () => {
    // Started long after the ETA: the arrival still happened, so it is still
    // worth saying - once.
    const { monitor, sendFn, client } = harness( underwayDoc(), ARRIVED + DURATION * 5 );

    await monitor.start();

    expect( sendFn ).toHaveBeenCalledTimes( 1 );
    expect( client.SHIP_POSITION.status ).toBe( 'idle' );

    await monitor.sweep();
    expect( sendFn ).toHaveBeenCalledTimes( 1 );

    monitor.stop();
  } );

  it( 'still settles the ship when the announcement fails', async () => {
    // Settling before announcing is deliberate: a missed message beats one
    // retried every minute forever, so the voyage must close out regardless.
    const client = {} as LCARSClient;
    const { connection, current } = fakeConnection( underwayDoc() );

    const failing = new ShipMonitor( {
      client,
      connection,
      alertChannelId: 'channel',
      pollIntervalMs: 60 * 60_000,
      sendFn: () => Promise.reject( new Error( 'channel gone' ) ),
      nowFn: () => ARRIVED
    } );

    await expect( failing.sweep() ).resolves.toBeUndefined();

    expect( client.SHIP_POSITION.status ).toBe( 'idle' );
    expect( current().status ).toBe( 'idle' );
    expect( current().transit ).toBeUndefined();
  } );

  it( 'does not throw when the database is unreachable', async () => {
    const client = {} as LCARSClient;
    const connection = {
      db: () => ( {
        collection: () => ( {
          findOne: () => Promise.reject( new Error( 'no connection' ) )
        } )
      } )
    } as unknown as MongoClient;

    const monitor = new ShipMonitor( {
      client,
      connection,
      alertChannelId: 'channel',
      pollIntervalMs: 60 * 60_000,
      sendFn: () => Promise.resolve()
    } );

    await expect( monitor.sweep() ).resolves.toBeUndefined();
  } );
} );

describe( 'ShipMonitor lifecycle', () => {
  it( 'reports running only between start and stop', async () => {
    const { monitor } = harness( mooredDoc(), DEPARTED );

    expect( monitor.isRunning() ).toBe( false );

    await monitor.start();
    expect( monitor.isRunning() ).toBe( true );

    // A second start is a no-op rather than a second timer.
    await monitor.start();
    expect( monitor.isRunning() ).toBe( true );

    monitor.stop();
    expect( monitor.isRunning() ).toBe( false );
  } );
} );

describe( 'ShipMonitor.buildArrivalEmbed', () => {
  it( 'names the destination sector and the course that was run', () => {
    const embed = ShipMonitor.buildArrivalEmbed( plan );
    const fields = embed.data.fields ?? [];
    const field = ( name: string ) => fields.find( f => f.name === name )?.value;

    expect( embed.data.title ).toBe( '🛰️ Arrival' );
    expect( field( 'Position' ) ).toContain( 'Alpha Quadrant' );
    expect( field( 'Course run' ) ).toContain( '000 mark 0' );
    expect( field( 'Course run' ) ).toContain( 'warp 6' );
    expect( field( 'Course run' ) ).toContain( '20.00 ly' );
  } );

  it( 'reports the elapsed voyage time, not the time since', () => {
    const embed = ShipMonitor.buildArrivalEmbed( plan );
    const elapsed = ( embed.data.fields ?? [] ).find( f => f.name === 'Elapsed' )?.value;

    // 20 ly at warp 6 is about 18 days 15 hours.
    expect( elapsed ).toMatch( /^18d/ );
  } );
} );
