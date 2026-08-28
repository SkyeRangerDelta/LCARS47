// -- Astrometrics Cache Tests --
// The cache is an optimisation, so the property that matters most is that it is
// never the reason a report fails.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { MongoClient } from 'mongodb';

import { DEFAULT_TTL_MS, through } from './Astro_Cache.js';

beforeAll( () => {
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'warn' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

interface Stored {
  key: string
  payload: unknown
  expiresAt: Date
}

/** Keyed like the real collection, so a lookup for the wrong key really misses. */
function fakeConnection( seed: Stored | null = null ) {
  const rows = new Map<string, Stored>();
  if ( seed != null ) rows.set( seed.key, seed );

  const collection = {
    findOne: vi.fn( ( filter: { key: string } ) => Promise.resolve( rows.get( filter.key ) ?? null ) ),
    updateOne: vi.fn( ( _filter: unknown, update: { $set: Stored } ) => {
      rows.set( update.$set.key, update.$set );
      return Promise.resolve( { acknowledged: true } );
    } )
  };

  const connection = {
    db: () => ( { collection: () => collection } )
  } as unknown as MongoClient;

  return { connection, collection, current: ( key = 'k' ) => rows.get( key ) ?? null };
}

/** A connection whose every operation fails. */
const brokenConnection = {
  db: () => ( {
    collection: () => ( {
      findOne: () => Promise.reject( new Error( 'no database' ) ),
      updateOne: () => Promise.reject( new Error( 'no database' ) )
    } )
  } )
} as unknown as MongoClient;

describe( 'through', () => {
  it( 'runs the work on a miss and stores the result', async () => {
    const { connection, collection, current } = fakeConnection();
    const work = vi.fn( () => Promise.resolve( { value: 42 } ) );

    const result = await through( connection, 'k', DEFAULT_TTL_MS, work );

    expect( result ).toEqual( { value: 42 } );
    expect( work ).toHaveBeenCalledTimes( 1 );
    expect( collection.updateOne ).toHaveBeenCalledTimes( 1 );
    expect( current()?.payload ).toEqual( { value: 42 } );
  } );

  it( 'returns a live entry without running the work', async () => {
    const { connection } = fakeConnection( {
      key: 'k',
      payload: { value: 'cached' },
      expiresAt: new Date( Date.now() + 60_000 )
    } );
    const work = vi.fn( () => Promise.resolve( { value: 'fresh' } ) );

    const result = await through( connection, 'k', DEFAULT_TTL_MS, work );

    expect( result ).toEqual( { value: 'cached' } );
    expect( work ).not.toHaveBeenCalled();
  } );

  it( 'treats an expired entry as a miss', async () => {
    const { connection } = fakeConnection( {
      key: 'k',
      payload: { value: 'stale' },
      expiresAt: new Date( Date.now() - 1 )
    } );
    const work = vi.fn( () => Promise.resolve( { value: 'fresh' } ) );

    const result = await through( connection, 'k', DEFAULT_TTL_MS, work );

    expect( result ).toEqual( { value: 'fresh' } );
    expect( work ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'just runs the work when there is no connection at all', async () => {
    const work = vi.fn( () => Promise.resolve( 'uncached' ) );

    expect( await through( null, 'k', DEFAULT_TTL_MS, work ) ).toBe( 'uncached' );
    expect( work ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'falls through to the work when the database is unreachable', async () => {
    const work = vi.fn( () => Promise.resolve( 'computed' ) );

    expect( await through( brokenConnection, 'k', DEFAULT_TTL_MS, work ) ).toBe( 'computed' );
    expect( work ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'still returns the result when the write fails', async () => {
    // A cache that cannot store must not swallow the answer it was caching.
    const connection = {
      db: () => ( {
        collection: () => ( {
          findOne: () => Promise.resolve( null ),
          updateOne: () => Promise.reject( new Error( 'read only' ) )
        } )
      } )
    } as unknown as MongoClient;

    expect( await through( connection, 'k', DEFAULT_TTL_MS, () => Promise.resolve( 7 ) ) )
      .toBe( 7 );
  } );

  it( 'lets a failure in the work itself propagate', async () => {
    // The caller decides how to degrade; the cache does not swallow errors.
    const { connection } = fakeConnection();

    await expect(
      through( connection, 'k', DEFAULT_TTL_MS, () => Promise.reject( new Error( 'boom' ) ) )
    ).rejects.toThrow( 'boom' );
  } );

  it( 'keys entries separately', async () => {
    const { connection, current } = fakeConnection();

    await through( connection, 'a', DEFAULT_TTL_MS, () => Promise.resolve( 'A' ) );
    const second = await through( connection, 'b', DEFAULT_TTL_MS, () => Promise.resolve( 'B' ) );

    expect( second ).toBe( 'B' );
    expect( current( 'a' )?.payload ).toBe( 'A' );
    expect( current( 'b' )?.payload ).toBe( 'B' );
  } );
} );
