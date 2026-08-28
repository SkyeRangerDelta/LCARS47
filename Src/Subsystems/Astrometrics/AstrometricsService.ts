// ---- Astrometrics Service ----
// Assembles a sensor report from three layers of decreasing certainty:
//
//   SIMBAD      real objects with real measured positions - but only within the
//               solar neighbourhood, where parallaxes mean anything
//   STAPI       canon Star Trek identity for a named object - but no coordinates
//   procedural  deterministic readings for the sector - available everywhere
//
// The procedural layer is the floor. Every remote lookup is allowed to fail,
// and when one does the report says what is missing rather than failing: a
// sensor report that errors out because a third party is down is worse than one
// that says long-range catalogue access is unavailable.

import { type MongoClient } from 'mongodb';

import Utility from '../Utilities/SysUtils.js';
import Cache from './Astro_Cache.js';
import Procedural from './ProceduralProvider.js';
import Simbad from './SimbadProvider.js';
import Stapi from './StapiProvider.js';
import { SOL, distance, subtract, vectorToBearing } from '../Ship/Ship_Navigation.js';
import type { ResolvedPosition } from '../Auxiliary/Interfaces/ShipInterfaces.js';
import type {
  AstrometricsReport,
  ScanResult,
  StellarNeighbour
} from './AstroInterfaces.js';

/** How far the sensor sweep reaches. */
export const SENSOR_RANGE_LY = 25;

/** How many neighbours a report lists, however many are in range. */
export const MAX_NEIGHBOURS = 8;

export interface AstrometricsOptions {
  /** Null disables caching; the service still works, just colder. */
  connection: MongoClient | null
  /** False keeps everything local - procedural readings only, no outbound calls. */
  remoteEnabled: boolean
}

/**
 * Sol is not in SIMBAD - it has no parallax to itself - so it is added by hand
 * when the ship is close enough for it to matter. Leaving it out would make the
 * one star everybody knows the only one the sweep could not see.
 */
function solAsNeighbour( from: ResolvedPosition ): StellarNeighbour | null {
  const range = distance( from.position, SOL );
  if ( range > SENSOR_RANGE_LY ) return null;

  const { bearing, mark } = vectorToBearing( from.position, subtract( SOL, from.position ) );

  return {
    name: 'Sol',
    position: { ...SOL },
    distanceLy: range,
    bearing,
    mark,
    spectralType: 'G2V',
    objectType: 'Star',
    source: 'simbad'
  };
}

/** Sector-keyed, because the ship stays in one for real weeks. */
function sweepCacheKey( from: ResolvedPosition ): string {
  const { x, y, z } = from.position;

  return `sweep:${ from.sector.grid.x },${ from.sector.grid.y },${ from.sector.grid.z }`
    // Position within the sector still matters for ranges, so it is quantised
    // rather than dropped - one light year is finer than any reader will notice.
    + `:${ Math.round( x ) },${ Math.round( y ) },${ Math.round( z ) }`;
}

/** A full sensor report for wherever the ship currently is. */
export async function buildReport(
  position: ResolvedPosition,
  opts: AstrometricsOptions
): Promise<AstrometricsReport> {
  const readings = Procedural.readSector( position.sector, position.position );

  if ( !opts.remoteEnabled ) {
    return {
      position,
      readings,
      neighbours: [solAsNeighbour( position )].filter( ( n ): n is StellarNeighbour => n != null ),
      catalogueNote: 'Long-range catalogue access is disabled. Local readings only.'
    };
  }

  if ( !Simbad.inCatalogueRange( position.position ) ) {
    return {
      position,
      readings,
      neighbours: [],
      catalogueNote:
        `Beyond charted space — no reliable stellar catalogue past `
        + `${ Simbad.SIMBAD_MAX_RANGE_LY } light years from Sol. Local readings only.`
    };
  }

  const found = await Simbad.safely(
    'Stellar sweep',
    async () => await Cache.through(
      opts.connection,
      sweepCacheKey( position ),
      Cache.DEFAULT_TTL_MS,
      async () => await Simbad.coneSearch( position.position, SENSOR_RANGE_LY, MAX_NEIGHBOURS )
    ),
    null
  );

  // A failed sweep and an empty one mean different things, so they are kept
  // apart: null is "we could not look", [] is "we looked and space is empty".
  if ( found == null ) {
    return {
      position,
      readings,
      neighbours: [solAsNeighbour( position )].filter( ( n ): n is StellarNeighbour => n != null ),
      catalogueNote: 'Long-range catalogue unreachable. Falling back to local readings.'
    };
  }

  const sol = solAsNeighbour( position );
  const neighbours = ( sol == null ? found : [sol, ...found] )
    .sort( ( a, b ) => a.distanceLy - b.distanceLy )
    .slice( 0, MAX_NEIGHBOURS );

  return {
    position,
    readings,
    neighbours,
    catalogueNote: neighbours.length === 0
      ? `No catalogued objects within ${ SENSOR_RANGE_LY } light years.`
      : null
  };
}

/**
 * Identify a named object and, where possible, put a range and bearing on it.
 *
 * Canon identity comes from STAPI; the fix comes from SIMBAD, tried first
 * against the name itself and then against whatever STAPI says it orbits. That
 * second attempt is what puts a bearing on Vulcan: the planet is fictional, but
 * 40 Eridani is not.
 */
export async function scan(
  query: string,
  position: ResolvedPosition,
  opts: AstrometricsOptions
): Promise<ScanResult> {
  if ( !opts.remoteEnabled ) {
    return {
      query,
      canon: null,
      fix: null,
      note: 'Long-range catalogue access is disabled.'
    };
  }

  const canonMatches = await Simbad.safely(
    'Canon lookup',
    async () => await Cache.through(
      opts.connection,
      `stapi:${ query.trim().toLowerCase() }`,
      Cache.DEFAULT_TTL_MS,
      async () => await Stapi.searchByName( query )
    ),
    []
  );

  const canon = Stapi.pickPrimary( canonMatches, query );

  const fix = await Simbad.safely(
    'Stellar fix',
    async () => await resolveFix( query, canon?.location?.name ?? null, position ),
    null
  );

  return { query, canon, fix, note: describeScan( canon, fix, canonMatches.length ) };
}

/** At most this many catalogue lookups per scan, so latency stays bounded. */
const MAX_FIX_CANDIDATES = 4;

/**
 * Names worth trying against the stellar catalogue, most specific first.
 *
 * A fictional planet has no catalogue entry, but the star it orbits usually
 * does - which is how Vulcan gets a bearing. Getting there needs two rewrites
 * of what STAPI reports as the parent:
 *
 *   'Vulcan system'  -> 'Vulcan'      trailing designator
 *   '40 Eridani A'   -> '40 Eridani'  trailing component letter
 *
 * The second one matters: SIMBAD indexes the system as `40 Eridani` and has no
 * identifier `40 Eridani A` at all, so without it the lookup simply misses.
 */
export function fixCandidates( query: string, parentName: string | null ): string[] {
  const out: string[] = [];

  const push = ( value: string | null ): void => {
    if ( value == null ) return;

    const trimmed = value.trim();
    if ( trimmed === '' ) return;
    if ( out.some( existing => existing.toLowerCase() === trimmed.toLowerCase() ) ) return;

    out.push( trimmed );
  };

  push( query );

  if ( parentName != null ) {
    push( parentName );

    const withoutDesignator = parentName.replace( /\s+(system|sector|cluster)$/i, '' ).trim();
    push( withoutDesignator );
    push( withoutDesignator.replace( /\s+[A-Z]$/, '' ) );
  }

  return out.slice( 0, MAX_FIX_CANDIDATES );
}

async function resolveFix(
  query: string,
  parentName: string | null,
  position: ResolvedPosition
): Promise<StellarNeighbour | null> {
  for ( const candidate of fixCandidates( query, parentName ) ) {
    const found = await Simbad.lookupByName( candidate, position.position );
    if ( found != null ) return found;
  }

  return null;
}

function describeScan(
  canon: ScanResult['canon'],
  fix: ScanResult['fix'],
  matchCount: number
): string | null {
  if ( canon == null && fix == null ) {
    return 'No record in either the canon database or the stellar catalogue.';
  }

  if ( fix == null ) {
    return 'Catalogued, but no navigational fix available — position not in the stellar database.';
  }

  if ( canon == null ) {
    return 'Stellar catalogue fix. No canon record under that name.';
  }

  return matchCount > 1
    ? `Canon record and stellar fix. ${ matchCount } related records on file.`
    : 'Canon record and stellar fix.';
}

/** Autocomplete for a scan target. Never throws; a slow catalogue yields no rows. */
export async function suggestScanTargets(
  query: string,
  opts: AstrometricsOptions
): Promise<{ name: string, value: string }[]> {
  if ( !opts.remoteEnabled ) return [];

  return await Stapi.suggestObjects( query );
}

/** Log once at boot so the operating mode is visible without reading env. */
export function describeMode( opts: AstrometricsOptions ): string {
  if ( !opts.remoteEnabled ) return 'local readings only (remote catalogues disabled)';

  return opts.connection == null
    ? 'remote catalogues enabled, uncached'
    : 'remote catalogues enabled, cached';
}

export function logMode( opts: AstrometricsOptions ): void {
  Utility.log( 'proc', `[ASTRO] Astrometrics running with ${ describeMode( opts ) }.` );
}

export default {
  buildReport,
  scan,
  suggestScanTargets,
  describeMode,
  logMode,
  SENSOR_RANGE_LY,
  MAX_NEIGHBOURS
};
