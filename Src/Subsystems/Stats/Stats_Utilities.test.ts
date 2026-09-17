// -- User Statistics Utilities Tests --
// The upsert shape is the piece worth testing hardest: it is the only write
// path, it runs on every message, and getting the $setOnInsert/$inc overlap
// wrong makes Mongo reject the update at runtime rather than at build time.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { MongoClient } from 'mongodb';

import {
  bumpUserStat,
  ensureStatsIndex,
  getUserStats,
  recordActivity
} from './Stats_Utilities.js';
import type { UserStatsRecord } from '../Auxiliary/Interfaces/UserStatsInterface.js';

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
  filter: Record<string, unknown>
  update: Record<string, Record<string, unknown>>
  options: { upsert?: boolean }
}

/**
 * Minimal stand-in for the one collection Stats_Utilities touches. Only the
 * three methods it actually calls are implemented, so an unexpected call is a
 * type error rather than a silent pass.
 */
function fakeConnection( initial: UserStatsRecord | null = null, failWith?: Error ) {
  const updates: UpdateCall[] = [];

  const collection = {
    findOne: vi.fn( () => Promise.resolve( initial ) ),
    updateOne: vi.fn( ( filter: unknown, update: unknown, options: unknown ) => {
      if ( failWith != null ) return Promise.reject( failWith );
      updates.push( {
        filter: filter as Record<string, unknown>,
        update: update as Record<string, Record<string, unknown>>,
        options: options as { upsert?: boolean }
      } );
      return Promise.resolve( { acknowledged: true } );
    } ),
    createIndex: vi.fn( () => {
      if ( failWith != null ) return Promise.reject( failWith );
      return Promise.resolve( 'id_1' );
    } )
  };

  const connection = {
    db: () => ( { collection: () => collection } )
  } as unknown as MongoClient;

  return { connection, collection, updates };
}

function record( over: Partial<UserStatsRecord> = {} ): UserStatsRecord {
  return {
    id: '1234567890',
    username: 'skyeranger',
    firstSeen: new Date( Date.UTC( 2026, 0, 1 ) ),
    lastSeen: new Date( Date.UTC( 2026, 8, 1 ) ),
    MESSAGES: 12,
    COMMANDS: 4,
    COMMANDS_FAILED: 1,
    REACTIONS: 7,
    ...over
  };
}

// -- Tests --

describe( 'bumpUserStat', () => {
  it( 'upserts so the first activity creates the record', async () => {
    const { connection, updates } = fakeConnection();

    await bumpUserStat( connection, '111', 'picard', 'MESSAGES' );

    expect( updates ).toHaveLength( 1 );
    expect( updates[0].options.upsert ).toBe( true );
    expect( updates[0].filter ).toEqual( { id: '111' } );
  } );

  it( 'increments the requested counter by the requested amount', async () => {
    const { connection, updates } = fakeConnection();

    await bumpUserStat( connection, '111', 'picard', 'REACTIONS', 3 );

    expect( updates[0].update.$inc ).toEqual( { REACTIONS: 3 } );
  } );

  it( 'defaults the increment to one', async () => {
    const { connection, updates } = fakeConnection();

    await bumpUserStat( connection, '111', 'picard', 'COMMANDS' );

    expect( updates[0].update.$inc ).toEqual( { COMMANDS: 1 } );
  } );

  it( 'never seeds the same field it increments', async () => {
    // Mongo rejects an update touching one field in both operators, so this
    // is the difference between working and throwing at runtime.
    const { connection, updates } = fakeConnection();

    await bumpUserStat( connection, '111', 'picard', 'MESSAGES' );

    const inc = Object.keys( updates[0].update.$inc );
    const seeded = Object.keys( updates[0].update.$setOnInsert );

    expect( inc ).toEqual( [ 'MESSAGES' ] );
    expect( seeded ).not.toContain( 'MESSAGES' );
  } );

  it( 'seeds every other counter to zero so a profile never renders undefined', async () => {
    const { connection, updates } = fakeConnection();

    await bumpUserStat( connection, '111', 'picard', 'MESSAGES' );

    expect( updates[0].update.$setOnInsert ).toMatchObject( {
      id: '111',
      COMMANDS: 0,
      COMMANDS_FAILED: 0,
      REACTIONS: 0
    } );
  } );

  it( 'refreshes the username on every write', async () => {
    const { connection, updates } = fakeConnection();

    await bumpUserStat( connection, '111', 'renamed-since', 'MESSAGES' );

    expect( updates[0].update.$set.username ).toBe( 'renamed-since' );
    expect( updates[0].update.$set.lastSeen ).toBeInstanceOf( Date );
  } );

  it( 'sets firstSeen only on insert', async () => {
    const { connection, updates } = fakeConnection();

    await bumpUserStat( connection, '111', 'picard', 'MESSAGES' );

    expect( updates[0].update.$setOnInsert.firstSeen ).toBeInstanceOf( Date );
    expect( updates[0].update.$set.firstSeen ).toBeUndefined();
  } );
} );

describe( 'recordActivity', () => {
  it( 'writes through to the collection', async () => {
    const { connection, updates } = fakeConnection();

    recordActivity( connection, '111', 'picard', 'MESSAGES' );
    await vi.waitFor( () => { expect( updates ).toHaveLength( 1 ); } );
  } );

  it( 'swallows a database failure instead of rejecting', async () => {
    // The whole reason this wrapper exists: an unhandled rejection here would
    // take out message handling.
    const { connection } = fakeConnection( null, new Error( 'RDS unreachable' ) );

    expect( () => recordActivity( connection, '111', 'picard', 'MESSAGES' ) ).not.toThrow();
    await vi.waitFor( () => {
      expect( console.warn ).toHaveBeenCalledWith( expect.stringContaining( 'RDS unreachable' ) );
    } );
  } );

  it( 'no-ops before the connection exists', () => {
    // Events can fire between login and the ready handler assigning
    // RDS_CONNECTION. Nowhere to write yet is not an error.
    expect( () => recordActivity( undefined, '111', 'picard', 'MESSAGES' ) ).not.toThrow();
  } );
} );

describe( 'getUserStats', () => {
  it( 'returns the stored record', async () => {
    const stored = record();
    const { connection } = fakeConnection( stored );

    await expect( getUserStats( connection, '1234567890' ) ).resolves.toEqual( stored );
  } );

  it( 'returns null for a member with no record rather than a zeroed one', async () => {
    const { connection } = fakeConnection( null );

    await expect( getUserStats( connection, '999' ) ).resolves.toBeNull();
  } );
} );

describe( 'ensureStatsIndex', () => {
  it( 'creates a unique index on the user id', async () => {
    const { connection, collection } = fakeConnection();

    await ensureStatsIndex( connection );

    expect( collection.createIndex ).toHaveBeenCalledWith( { id: 1 }, { unique: true } );
  } );

  it( 'does not throw when index creation fails', async () => {
    // Boot must survive this - the collection answers fine unindexed.
    const { connection } = fakeConnection( null, new Error( 'no permission' ) );

    await expect( ensureStatsIndex( connection ) ).resolves.toBeUndefined();
  } );
} );
