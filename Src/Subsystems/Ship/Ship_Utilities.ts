// ---- Ship Position Utilities ----
// Persistence for the ship's position, plus the resolver that turns a stored
// document into where the ship actually is right now.
//
// THE CENTRAL IDEA: position in transit is DERIVED, never ticked.
//
// A voyage stores an origin, a destination and two timestamps, and nothing ever
// writes an intermediate position. Every read interpolates. That means there is
// no drift to reconcile, no catch-up logic, and a bot restart mid-voyage is a
// non-event - the ship carries on from exactly where the clock says it is.
// ShipMonitor exists only to announce arrival and tidy the document; if it
// never ran, every reader would still report the right answer.

import { type Db, type MongoClient } from 'mongodb';

import Utility from '../Utilities/SysUtils.js';
import {
  SOL,
  distance,
  distanceFromCore,
  distanceFromSol,
  lerp,
  projectCourse,
  sectorAddress,
  subtract,
  transitDurationMs,
  vectorToBearing
} from './Ship_Navigation.js';
import type {
  ResolvedPosition,
  ShipPosition,
  TransitPlan,
  Vector3
} from '../Auxiliary/Interfaces/ShipInterfaces.js';

// Constants
const COLLECTION_NAME = 'ship_position';

/** The singleton document key, matching the rds_status convention. */
const SHIP_ID = 1 as const;

/** Where the ship starts life: in orbit of Earth, Sector 001. */
export const SEED_ANCHORAGE = 'Earth';

// Helper to get database
function getDatabase( connection: MongoClient ): Db {
  return connection.db( 'LCARS47_DS' );
}

function seedDocument(): ShipPosition {
  return {
    id: SHIP_ID,
    status: 'orbit',
    position: { ...SOL },
    anchorage: SEED_ANCHORAGE,
    updatedAt: new Date(),
    updatedBy: 'system'
  };
}

/**
 * Load the ship's document, seeding it on first ever read.
 *
 * Get-or-create rather than a migration: the collection simply does not exist
 * until someone asks where the ship is, and the answer on that first ask is
 * "in orbit of Earth", which is where she starts.
 */
export async function getShipPosition( connection: MongoClient ): Promise<ShipPosition> {
  const collection = getDatabase( connection ).collection<ShipPosition>( COLLECTION_NAME );

  const existing = await collection.findOne( { id: SHIP_ID } );
  if ( existing != null ) return existing;

  Utility.log( 'info', '[SHIP] No position on record - seeding Earth orbit, Sector 001.' );

  const seeded = seedDocument();
  await collection.insertOne( seeded );

  return seeded;
}

/**
 * Where the ship is at a given instant.
 *
 * Pure: no I/O, so it can be tested against a hand-built document and a fixed
 * clock. Note that a voyage whose ETA has passed resolves as `idle` even though
 * the document still says `transit` - the ship has arrived, the document just
 * has not been tidied yet, and callers should act on the truth rather than wait
 * for the monitor's next sweep.
 */
export function resolveShipPosition( doc: ShipPosition, now: number ): ResolvedPosition {
  const underway = doc.status === 'transit' && doc.transit != null;
  const plan = doc.transit;

  if ( !underway || plan == null ) {
    return describe( doc.status, doc.position, doc.anchorage, doc.updatedAt );
  }

  const departed = plan.departedAt.getTime();
  const eta = plan.etaAt.getTime();
  const span = eta - departed;

  // A zero or negative span would divide by zero; treat it as already arrived.
  const legProgress = span > 0
    ? Math.min( 1, Math.max( 0, ( now - departed ) / span ) )
    : 1;

  const position = lerp( plan.origin, plan.destination, legProgress );

  if ( legProgress >= 1 ) {
    return describe( 'idle', plan.destination, undefined, doc.updatedAt );
  }

  // Progress spans the whole voyage, not just the current leg, so a speed
  // change part way does not reset the bar to zero.
  const priorLegsLy = voyageRunBeforeLeg( plan );
  const totalDistanceLy = priorLegsLy + plan.distanceLy;
  const travelledLy = priorLegsLy + plan.distanceLy * legProgress;

  return {
    ...describe( 'transit', position, undefined, doc.updatedAt ),
    transit: {
      ...plan,
      progress: totalDistanceLy > 0 ? travelledLy / totalDistanceLy : 1,
      totalDistanceLy,
      travelledLy,
      remainingLy: plan.distanceLy * ( 1 - legProgress ),
      remainingMs: Math.max( 0, eta - now )
    }
  };
}

/** Distance covered on legs completed before the current one. */
export function voyageRunBeforeLeg( plan: TransitPlan ): number {
  return plan.voyageOrigin == null ? 0 : distance( plan.voyageOrigin, plan.origin );
}

/** Distance of the whole voyage, across every leg. */
export function voyageDistanceLy( plan: TransitPlan ): number {
  return voyageRunBeforeLeg( plan ) + plan.distanceLy;
}

/** When the voyage began, as opposed to the current leg. */
export function voyageDepartedAt( plan: TransitPlan ): Date {
  return plan.voyageDepartedAt ?? plan.departedAt;
}

function describe(
  status: ResolvedPosition['status'],
  position: Vector3,
  anchorage: string | undefined,
  updatedAt: Date
): ResolvedPosition {
  return {
    status,
    position,
    sector: sectorAddress( position ),
    distanceFromCoreLy: distanceFromCore( position ),
    distanceFromSolLy: distanceFromSol( position ),
    anchorage,
    updatedAt
  };
}

/** Has a stored voyage finished without the document catching up yet? */
export function arrivalDue( doc: ShipPosition, now: number ): boolean {
  return doc.status === 'transit'
    && doc.transit != null
    && now >= doc.transit.etaAt.getTime();
}

export interface CourseOrder {
  bearing: number
  mark: number
  distanceLy: number
  warpFactor: number
  orderedBy: string
}

/**
 * Build the transit plan a course would produce, without committing it.
 *
 * Separated from setCourse so the command can validate the twelve-hour rule and
 * render an ETA before deciding whether the order is legal.
 */
export function planCourse(
  from: Vector3,
  order: CourseOrder,
  now: number
): TransitPlan {
  const durationMs = transitDurationMs( order.distanceLy, order.warpFactor );

  return {
    origin: { ...from },
    voyageOrigin: { ...from },
    destination: projectCourse( from, order.bearing, order.mark, order.distanceLy ),
    bearing: order.bearing,
    mark: order.mark,
    distanceLy: order.distanceLy,
    warpFactor: order.warpFactor,
    departedAt: new Date( now ),
    voyageDepartedAt: new Date( now ),
    etaAt: new Date( now + durationMs ),
    orderedBy: order.orderedBy
  };
}

/**
 * Rebuild a voyage at a new velocity, from wherever the ship has reached.
 *
 * A speed change is not a mutation of the running plan - it is a fresh leg. The
 * ship's interpolated position becomes the new leg origin, the destination is
 * untouched, and the clock restarts. That keeps the whole model as "two points
 * and two timestamps", so nothing about restart safety or drift changes.
 *
 * The bearing is recomputed rather than copied: the local navigation frame
 * rotates as the ship moves around the core, so the same physical heading reads
 * as a slightly different azimuth from the new position.
 */
export function planSpeedChange(
  plan: TransitPlan,
  positionNow: Vector3,
  warpFactor: number,
  now: number,
  orderedBy: string
): TransitPlan {
  const remainingLy = distance( positionNow, plan.destination );
  const heading = subtract( plan.destination, positionNow );
  const { bearing, mark } = vectorToBearing( positionNow, heading );

  return {
    origin: { ...positionNow },
    voyageOrigin: { ...( plan.voyageOrigin ?? plan.origin ) },
    destination: { ...plan.destination },
    bearing,
    mark,
    distanceLy: remainingLy,
    warpFactor,
    departedAt: new Date( now ),
    voyageDepartedAt: new Date( plan.voyageDepartedAt ?? plan.departedAt ),
    etaAt: new Date( now + transitDurationMs( remainingLy, warpFactor ) ),
    orderedBy
  };
}

/** Commit a voyage. The caller is responsible for having checked it is legal. */
export async function setCourse(
  connection: MongoClient,
  plan: TransitPlan
): Promise<ShipPosition> {
  const collection = getDatabase( connection ).collection<ShipPosition>( COLLECTION_NAME );

  const next: ShipPosition = {
    id: SHIP_ID,
    status: 'transit',
    position: { ...plan.origin },
    transit: plan,
    updatedAt: new Date( plan.departedAt ),
    updatedBy: plan.orderedBy
  };

  // $unset the anchorage explicitly: a ship under way is not moored to
  // anything, and leaving a stale 'Earth' behind would be a lie.
  await collection.updateOne(
    { id: SHIP_ID },
    {
      $set: {
        status: next.status,
        position: next.position,
        transit: next.transit,
        updatedAt: next.updatedAt,
        updatedBy: next.updatedBy
      },
      $unset: { anchorage: '' }
    },
    { upsert: true }
  );

  return next;
}

/**
 * Drop out of warp and settle at a position.
 *
 * Used both for a completed voyage (settling at the destination) and for an
 * aborted one (settling wherever the interpolator says the ship had reached).
 */
export async function settleAt(
  connection: MongoClient,
  position: Vector3,
  updatedBy: string
): Promise<ShipPosition> {
  const collection = getDatabase( connection ).collection<ShipPosition>( COLLECTION_NAME );

  const next: ShipPosition = {
    id: SHIP_ID,
    status: 'idle',
    position: { ...position },
    updatedAt: new Date(),
    updatedBy
  };

  await collection.updateOne(
    { id: SHIP_ID },
    {
      $set: {
        status: next.status,
        position: next.position,
        updatedAt: next.updatedAt,
        updatedBy: next.updatedBy
      },
      $unset: { transit: '', anchorage: '' }
    },
    { upsert: true }
  );

  return next;
}

export default {
  getShipPosition,
  resolveShipPosition,
  arrivalDue,
  planCourse,
  planSpeedChange,
  setCourse,
  settleAt,
  voyageDepartedAt,
  voyageDistanceLy,
  voyageRunBeforeLeg,
  SEED_ANCHORAGE
};
