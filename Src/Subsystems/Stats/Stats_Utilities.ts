// ---- User Statistics Utilities ----
// Persistence for per-member activity counters.
//
// THE CENTRAL IDEA: every write is a single upsert.
//
// There is no "create the record" path and no read-modify-write anywhere in
// here. The first time a member does anything, the same updateOne that
// increments their counter also seeds the document; every subsequent one just
// increments. That means no lost updates under concurrency, no ordering
// requirement between events, and no membership backfill to run at boot.
//
// The second rule: a stats write must never be able to break the thing it is
// counting. recordActivity() swallows and logs, so a Mongo outage costs you
// telemetry and nothing else - messages still send, commands still run.

import { type Collection, type Db, type MongoClient } from 'mongodb';

import Utility from '../Utilities/SysUtils.js';
import type {
  UserStatField,
  UserStatsRecord
} from '../Auxiliary/Interfaces/UserStatsInterface.js';

// Constants
const COLLECTION_NAME = 'user_stats';

/** Counters a fresh document starts with, so a profile never renders undefined. */
const ZEROED: Record<UserStatField, number> = {
  MESSAGES: 0,
  COMMANDS: 0,
  COMMANDS_FAILED: 0,
  REACTIONS: 0
};

function getCollection( connection: MongoClient ): Collection<UserStatsRecord> {
  const database: Db = connection.db( 'LCARS47_DS' );
  return database.collection<UserStatsRecord>( COLLECTION_NAME );
}

/**
 * Increment one counter on a member's record, creating it if this is the
 * first thing they have ever done.
 *
 * `$setOnInsert` seeds every counter to zero EXCEPT the one being incremented -
 * Mongo rejects an update that touches the same field in both `$inc` and
 * `$setOnInsert`, and `$inc` on a missing field already yields the right value.
 *
 * @param connection - Live RDS client.
 * @param userId - Discord user id.
 * @param username - Current username, refreshed on every call.
 * @param field - Which counter to bump.
 * @param amount - How much by. Defaults to 1.
 */
export async function bumpUserStat(
  connection: MongoClient,
  userId: string,
  username: string,
  field: UserStatField,
  amount = 1
): Promise<void> {
  const now = new Date();

  // Seed the OTHER counters only - see the note above.
  const seedCounters: Partial<Record<UserStatField, number>> = { ...ZEROED };
  delete seedCounters[field];

  await getCollection( connection ).updateOne(
    { id: userId },
    {
      $inc: { [field]: amount },
      $set: { username },
      // $max, not $set. These writes are fire-and-forget, so two events can
      // land out of order and an older one would otherwise drag lastSeen
      // backwards. $max makes the field monotonic regardless of arrival order.
      $max: { lastSeen: now },
      $setOnInsert: { id: userId, firstSeen: now, ...seedCounters }
    },
    { upsert: true }
  );
}

/**
 * Bump a counter without making the caller care whether it worked.
 *
 * Every call site for this is inside an event handler on the hot path, where
 * an unhandled rejection would take out message handling or command dispatch.
 * Fire-and-forget by design: callers do not await it and there is nothing to
 * await for.
 */
export function recordActivity(
  connection: MongoClient | undefined,
  userId: string,
  username: string,
  field: UserStatField,
  amount = 1
): void {
  // RDS_CONNECTION is assigned in the ready event, after login. Anything that
  // fires in that window has nowhere to write yet, which is not an error.
  if ( connection == null ) return;

  void bumpUserStat( connection, userId, username, field, amount )
    .catch( ( statErr: Error ) => {
      Utility.log( 'warn', `[USER-STATS] Failed to record ${ field } for ${ userId }: ${ statErr.message }` );
    } );
}

/**
 * Read a member's record.
 *
 * Returns null when they have no record rather than a zeroed one: "no
 * telemetry on file" and "here since the dawn of time with zero messages" are
 * different answers and /profile renders them differently.
 */
export async function getUserStats(
  connection: MongoClient,
  userId: string
): Promise<UserStatsRecord | null> {
  return await getCollection( connection ).findOne( { id: userId } );
}

/**
 * Create the lookup index.
 *
 * Idempotent, so calling it on every boot is fine. Not required for
 * correctness - an unindexed collection this small answers fine either way -
 * but the upsert path touches it on every single message.
 *
 * Deliberately NOT a startup prerequisite. Without the unique index two
 * simultaneous first-events for one member could in principle both insert and
 * split their counters, but the cost of that is a slightly wrong message count
 * for one person. Refusing to boot the bot over it would trade a cosmetic
 * inaccuracy for total unavailability, which is plainly the worse failure.
 */
export async function ensureStatsIndex( connection: MongoClient ): Promise<void> {
  try {
    await getCollection( connection ).createIndex( { id: 1 }, { unique: true } );
    Utility.log( 'info', '[USER-STATS] Index ready.' );
  }
  catch ( indexErr ) {
    Utility.log( 'warn', `[USER-STATS] Index creation failed: ${ ( indexErr as Error ).message }` );
  }
}

export default {
  bumpUserStat,
  recordActivity,
  getUserStats,
  ensureStatsIndex
};
