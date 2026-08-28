// ---- Ship Flavour and Formatting ----
// Wording and presentation for the navigation commands. Kept apart from the
// maths so Ship_Navigation stays a pure numbers module, and apart from the
// command so the phrasing can be changed without touching interaction handling.

import type {
  ResolvedPosition,
  SectorAddress,
  TransitPlan,
  Vector3
} from '../Auxiliary/Interfaces/ShipInterfaces.js';
import {
  WARP_DEFAULT,
  WARP_MAX_CRUISE,
  WARP_MAX_RATED,
  WARP_OPEN_MAX,
  sectorAddress,
  velocityBand
} from './Ship_Navigation.js';

// -- Palette --

/** Underway. LCARS amber. */
export const COLOUR_TRANSIT = 0xFF9900;
/** Moored, in orbit, or holding station. LCARS blue. */
export const COLOUR_STATION = 0x99CCFF;
/** An order the ship will not accept. */
export const COLOUR_REFUSED = 0xCC6666;
/** Arrival announcements. */
export const COLOUR_ARRIVAL = 0x66CC99;

// -- Status wording --

const STATUS_LABEL: Readonly<Record<ResolvedPosition['status'], string>> = {
  docked: 'Docked',
  orbit: 'Standard orbit',
  idle: 'Station-keeping',
  transit: 'Under way'
};

const STATUS_ICON: Readonly<Record<ResolvedPosition['status'], string>> = {
  docked: '⚓',
  orbit: '🪐',
  idle: '🛰️',
  transit: '🚀'
};

export function statusLabel( status: ResolvedPosition['status'] ): string {
  return STATUS_LABEL[status];
}

export function statusIcon( status: ResolvedPosition['status'] ): string {
  return STATUS_ICON[status];
}

// -- Velocity wording --

/**
 * How a warp factor reads on a status board.
 *
 * The bands are the Technical Manual's: warp 6 is the normal cruising speed the
 * Galaxy class can hold until fuel exhaustion, 9.2 the maximum sustainable
 * cruise, 9.6 the rated maximum.
 */
export function velocityLabel( warpFactor: number ): string {
  switch ( velocityBand( warpFactor ) ) {
    case 'cruise':
      return warpFactor === WARP_DEFAULT ? 'Normal cruise' : 'Sustained cruise';
    case 'above-cruise':
      return 'Above normal cruise';
    case 'high-warp':
      return 'High warp';
  }
}

/**
 * The engineering note that goes with a velocity, or null when there is nothing
 * worth saying. Straight out of the Technical Manual.
 */
export function velocityNote( warpFactor: number ): string | null {
  if ( warpFactor > WARP_MAX_CRUISE ) {
    return 'All three deflector generators in phase sync. Structural stress elevated;'
      + ` sustained velocity above warp ${ WARP_MAX_CRUISE } is limited to twelve hours.`;
  }

  if ( warpFactor > WARP_OPEN_MAX ) {
    return 'Structural integrity field at elevated draw. Within maximum sustainable cruise.';
  }

  if ( warpFactor > 8 ) {
    return 'Two deflector generators operating in phase sync.';
  }

  if ( warpFactor > WARP_DEFAULT ) {
    return 'Above normal cruise. Power draw elevated but indefinitely sustainable.';
  }

  return null;
}

// -- Flavour --

const DEPARTURE_MESSAGES: string[] = [
  'Helm answers ready. Engage.',
  'Course laid in. Taking us out.',
  'Warp field stable. Under way.',
  'Navigational deflector at station-keeping power. Departing.',
  'Course plotted and confirmed by stellar cartography.',
  'All decks report ready for warp. Engaging.'
];

const ARRIVAL_MESSAGES: string[] = [
  'Dropping out of warp. We have arrived.',
  'Arrived at the designated coordinates. Holding station.',
  'Warp field collapsed. Impulse engines answering.',
  'We are at station-keeping. Sensors sweeping the sector.',
  'Arrival confirmed. Awaiting further orders.'
];

const ACCELERATION_MESSAGES: string[] = [
  'Increasing to the new velocity. Warp field holding.',
  'Engines answering. Coming up to speed.',
  'Ahead faster. Recalculating time to arrival.',
  'Power to the warp coils. Accelerating.'
];

const DECELERATION_MESSAGES: string[] = [
  'Reducing speed. Warp field stable at the new factor.',
  'Throttling back. Recalculating time to arrival.',
  'Coming down to the new velocity.',
  'Easing off the coils. Slowing.'
];

const REFUSAL_UNDERWAY: string[] = [
  'The ship is already under way. Course changes en route are not authorised.',
  'We are at warp. The helm will not accept a new heading until we arrive.',
  'Negative - a course is already laid in. Stand by for arrival.'
];

/**
 * Uniform pick from a list.
 *
 * Mirrors Dabo_Messages.getRandomMessage; there is no shared helper for this in
 * the codebase and duplicating four lines beats coupling the two subsystems.
 */
function getRandomMessage( messages: string[] ): string {
  return messages[Math.floor( Math.random() * messages.length )];
}

export function getDepartureMessage(): string {
  return getRandomMessage( DEPARTURE_MESSAGES );
}

export function getArrivalMessage(): string {
  return getRandomMessage( ARRIVAL_MESSAGES );
}

export function getUnderwayRefusal(): string {
  return getRandomMessage( REFUSAL_UNDERWAY );
}

/** Speeding up and slowing down do not read the same on the bridge. */
export function getSpeedChangeMessage( from: number, to: number ): string {
  return to > from
    ? getRandomMessage( ACCELERATION_MESSAGES )
    : getRandomMessage( DECELERATION_MESSAGES );
}

// -- Formatting --

/** Canon course notation: `045 mark 12`. */
export function formatCourse( bearing: number, mark: number ): string {
  return `${ String( Math.round( bearing ) ).padStart( 3, '0' ) } mark ${ Math.round( mark ) }`;
}

/** A GSRF coordinate triple, rounded to something a human can read. */
export function formatCoordinates( position: Vector3 ): string {
  const fixed = ( n: number ): string => n.toFixed( 2 );
  return `${ fixed( position.x ) }, ${ fixed( position.y ) }, ${ fixed( position.z ) }`;
}

/**
 * Where a voyage is headed.
 *
 * A course laid in against a named point says the name; one laid in on a
 * bearing has no name to give, so it falls back to the destination sector.
 */
export function describeDestination( plan: TransitPlan ): string {
  const sector = formatSector( sectorAddress( plan.destination ) );

  return plan.destinationName == null
    ? sector
    : `**${ plan.destinationName }** · ${ sector }`;
}

/** `Sector 001 · Alpha Quadrant`. */
export function formatSector( sector: SectorAddress ): string {
  return `Sector ${ sector.designation } · ${ sector.quadrant } Quadrant`;
}

/** Warp factors read as `warp 9.2`, with trailing zeroes trimmed. */
export function formatWarp( warpFactor: number ): string {
  return `warp ${ Number( warpFactor.toFixed( 2 ) ) }`;
}

/**
 * A duration in days, hours and minutes.
 *
 * Voyages here run for real days at cruise, so seconds are noise; anything
 * under a minute reads as "less than a minute" rather than "0m".
 */
export function formatDuration( ms: number ): string {
  if ( !Number.isFinite( ms ) || ms < 0 ) return 'unknown';

  const totalMinutes = Math.floor( ms / 60_000 );
  if ( totalMinutes < 1 ) return 'less than a minute';

  const days = Math.floor( totalMinutes / 1440 );
  const hours = Math.floor( ( totalMinutes % 1440 ) / 60 );
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if ( days > 0 ) parts.push( `${ days }d` );
  if ( hours > 0 ) parts.push( `${ hours }h` );
  if ( minutes > 0 ) parts.push( `${ minutes }m` );

  return parts.join( ' ' );
}

const BAR_WIDTH = 20;

/** A twenty-cell progress bar. `progress` is clamped to [0, 1]. */
export function progressBar( progress: number ): string {
  const safe = Number.isFinite( progress ) ? Math.min( 1, Math.max( 0, progress ) ) : 0;
  const filled = Math.round( safe * BAR_WIDTH );

  return `${ '█'.repeat( filled ) }${ '░'.repeat( BAR_WIDTH - filled ) } ${ Math.round( safe * 100 ) }%`;
}

/** Discord relative timestamp, e.g. "in 3 days". */
export function relativeTimestamp( at: Date ): string {
  return `<t:${ Math.floor( at.getTime() / 1000 ) }:R>`;
}

/** Discord absolute timestamp in the reader's own locale and timezone. */
export function absoluteTimestamp( at: Date ): string {
  return `<t:${ Math.floor( at.getTime() / 1000 ) }:f>`;
}

/** How far above or below the galactic plane the ship is sitting. */
export function formatGalacticPlane( z: number ): string {
  const magnitude = Math.abs( z );
  if ( magnitude < 0.005 ) return 'in the galactic plane';

  return `${ magnitude.toFixed( 2 ) } ly ${ z > 0 ? 'above' : 'below' } the galactic plane`;
}

export default {
  COLOUR_TRANSIT,
  COLOUR_STATION,
  COLOUR_REFUSED,
  COLOUR_ARRIVAL,
  statusLabel,
  statusIcon,
  velocityLabel,
  velocityNote,
  getDepartureMessage,
  getArrivalMessage,
  getUnderwayRefusal,
  getSpeedChangeMessage,
  formatCourse,
  formatCoordinates,
  formatSector,
  describeDestination,
  formatWarp,
  formatDuration,
  progressBar,
  relativeTimestamp,
  absoluteTimestamp,
  formatGalacticPlane,
  WARP_MAX_RATED
};
