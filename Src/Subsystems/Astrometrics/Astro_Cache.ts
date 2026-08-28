// ---- Astrometrics Cache ----
// A small TTL cache in front of the remote catalogues.
//
// Worth having because of how the ship moves: she sits in one 20 ly sector for
// real weeks, so a sector-keyed sweep is asked for over and over with the same
// answer. Mongo rather than memory so a deploy does not throw the results away.
//
// Expiry is checked on read rather than left to a TTL index: it is one
// comparison, it needs no index management, and a stale row costs nothing until
// someone asks for it.

import { type Db, type MongoClient } from 'mongodb';

import Utility from '../Utilities/SysUtils.js';

const COLLECTION_NAME = 'astro_cache';

/** Catalogue data does not change on any timescale we care about. */
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  key: string
  payload: unknown
  expiresAt: Date
}

function getDatabase( connection: MongoClient ): Db {
  return connection.db( 'LCARS47_DS' );
}

/**
 * Read through the cache.
 *
 * A cache miss, a stale row, or a database that is simply unavailable all lead
 * to the same place: run the work. The cache is an optimisation, so it is never
 * allowed to be the reason a report fails.
 */
export async function through<T>(
  connection: MongoClient | null,
  key: string,
  ttlMs: number,
  work: () => Promise<T>
): Promise<T> {
  if ( connection == null ) return await work();

  const collection = getDatabase( connection ).collection<CacheEntry>( COLLECTION_NAME );

  try {
    const hit = await collection.findOne( { key } );

    if ( hit != null && hit.expiresAt.getTime() > Date.now() ) {
      return hit.payload as T;
    }
  }
  catch ( err ) {
    Utility.log( 'warn', `[ASTRO] Cache read failed for ${ key }: ${ ( err as Error ).message }` );
  }

  const fresh = await work();

  try {
    await collection.updateOne(
      { key },
      { $set: { key, payload: fresh, expiresAt: new Date( Date.now() + ttlMs ) } },
      { upsert: true }
    );
  }
  catch ( err ) {
    Utility.log( 'warn', `[ASTRO] Cache write failed for ${ key }: ${ ( err as Error ).message }` );
  }

  return fresh;
}

/** Drop everything. Only used when something has gone visibly wrong. */
export async function clear( connection: MongoClient ): Promise<number> {
  const result = await getDatabase( connection )
    .collection<CacheEntry>( COLLECTION_NAME )
    .deleteMany( {} );

  return result.deletedCount;
}

export default { through, clear, DEFAULT_TTL_MS };
