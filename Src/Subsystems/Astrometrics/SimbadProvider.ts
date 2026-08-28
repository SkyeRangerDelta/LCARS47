// ---- SIMBAD Provider ----
// Real stars, from the CDS SIMBAD TAP service. Free, no key, ADQL over HTTP.
//
// SIMBAD speaks ICRS and parallaxes; the ship speaks GSRF. Astro_Coordinates
// does the conversion, and the query below is phrased in heliocentric
// equatorial Cartesian light years so the database does the volume filtering
// rather than us pulling half the catalogue and throwing it away.
//
// RANGE. A parallax is only a distance if it is measured well, which in practice
// means the solar neighbourhood. Past SIMBAD_MAX_RANGE_LY this provider returns
// nothing and says why, rather than reporting stars whose distances are noise.

import Utility from '../Utilities/SysUtils.js';
import { LY_PER_PARSEC, gsrfToIcrsCartesian, icrsToGsrf } from './Astro_Coordinates.js';
import { SOL, distance, vectorToBearing, subtract } from '../Ship/Ship_Navigation.js';
import type { Vector3 } from '../Auxiliary/Interfaces/ShipInterfaces.js';
import type { StellarNeighbour } from './AstroInterfaces.js';

const SIMBAD_TAP = 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync';

/** Beyond this from Sol, parallax distances are not worth reporting. */
export const SIMBAD_MAX_RANGE_LY = 500;

const REQUEST_TIMEOUT_MS = 15_000;

/** Rows to ask for before local filtering. Generous - the box is a cube, the range is a sphere. */
const QUERY_LIMIT = 400;

/**
 * Object types that are not stars.
 *
 * SIMBAD returns exoplanets at their host star's coordinates, so an unfiltered
 * sweep lists Proxima b three times over. ADQL on this service will not take a
 * NOT LIKE on otype, so the filtering happens here.
 */
const PLANET_TYPES = ['Pl', 'Pl?', 'Pl_Candidate'];

/**
 * How close two rows have to be to count as the same object.
 *
 * A multiple system is listed as the composite plus each component, and the
 * composite carries its own slightly different parallax - alpha Centauri comes
 * back at 4.34 ly and 4.39 ly for what is one point on any chart. Distinct
 * systems are light years apart, so this is a wide margin with nothing in it.
 */
const DUPLICATE_RADIUS_LY = 0.15;

interface TapResponse {
  data?: unknown[][]
}

/** One SIMBAD row, after the shape has been checked. */
interface SimbadRow {
  mainId: string
  ra: number
  dec: number
  parallaxMas: number
  spectralType: string | null
  objectType: string | null
}

/**
 * Strip the catalogue decoration off a SIMBAD identifier.
 *
 * `* alf Cen A` and `NAME Barnard's Star` are how the database writes them;
 * neither belongs on a bridge display.
 */
export function tidyName( mainId: string ): string {
  return mainId
    .replace( /^NAME\s+/i, '' )
    .replace( /^\*\s+/, '' )
    .replace( /\s+/g, ' ' )
    .trim();
}

function parseRow( row: unknown[] ): SimbadRow | null {
  const [mainId, ra, dec, parallax, spectral, otype] = row;

  if ( typeof mainId !== 'string' ) return null;
  if ( typeof ra !== 'number' || typeof dec !== 'number' ) return null;
  if ( typeof parallax !== 'number' || parallax <= 0 ) return null;

  return {
    mainId,
    ra,
    dec,
    parallaxMas: parallax,
    spectralType: typeof spectral === 'string' ? spectral : null,
    objectType: typeof otype === 'string' ? otype : null
  };
}

async function runQuery( adql: string ): Promise<SimbadRow[]> {
  const params = new URLSearchParams( {
    request: 'doQuery',
    lang: 'adql',
    format: 'json',
    query: adql
  } );

  const response = await fetch( `${ SIMBAD_TAP }?${ params.toString() }`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout( REQUEST_TIMEOUT_MS )
  } );

  if ( !response.ok ) {
    throw new Error( `SIMBAD returned HTTP ${ response.status }` );
  }

  // An ADQL error comes back as a VOTable XML document with a 200, so a parse
  // failure here means the query was rejected rather than the service being down.
  const body = await response.json() as TapResponse;

  return ( body.data ?? [] )
    .map( parseRow )
    .filter( ( row ): row is SimbadRow => row != null );
}

/** Turn a catalogue row into a neighbour, positioned relative to the ship. */
function toNeighbour( row: SimbadRow, from: Vector3 ): StellarNeighbour {
  const distanceLy = ( 1000 / row.parallaxMas ) * LY_PER_PARSEC;
  const position = icrsToGsrf( row.ra, row.dec, distanceLy );
  const { bearing, mark } = vectorToBearing( from, subtract( position, from ) );

  return {
    name: tidyName( row.mainId ),
    position,
    distanceLy: distance( position, from ),
    bearing,
    mark,
    spectralType: row.spectralType,
    objectType: row.objectType,
    source: 'simbad'
  };
}

/**
 * Drop rows that describe the same object twice.
 *
 * A multiple system appears as the composite and each component, all at
 * effectively the same coordinates. Keeping the first of each cluster gives one
 * entry per point in space, which is what a sensor sweep would report.
 */
function dedupe( neighbours: StellarNeighbour[] ): StellarNeighbour[] {
  const kept: StellarNeighbour[] = [];

  for ( const candidate of neighbours ) {
    const duplicate = kept.some(
      existing => distance( existing.position, candidate.position ) < DUPLICATE_RADIUS_LY
    );
    if ( !duplicate ) kept.push( candidate );
  }

  return kept;
}

/**
 * Real objects within `radiusLy` of a point, nearest first.
 *
 * Returns an empty list when the ship is beyond usable catalogue range; the
 * caller distinguishes that from "nothing out there" via `inCatalogueRange`.
 */
export async function coneSearch(
  centre: Vector3,
  radiusLy: number,
  limit: number
): Promise<StellarNeighbour[]> {
  if ( !inCatalogueRange( centre ) ) return [];

  const c = gsrfToIcrsCartesian( centre );

  // A cube around the target, evaluated by the database. The exact sphere test
  // happens below - a box is what ADQL can index against cheaply.
  const axis = ( expr: string, offset: number ): string =>
    `ABS(${ LY_PER_PARSEC }*(1000/plx_value)*${ expr } - (${ offset })) < ${ radiusLy }`;

  const adql = [
    'SELECT TOP', QUERY_LIMIT,
    'main_id, ra, dec, plx_value, sp_type, otype_txt FROM basic',
    'WHERE plx_value > 0 AND ra IS NOT NULL AND dec IS NOT NULL',
    'AND', axis( 'COS(RADIANS(dec))*COS(RADIANS(ra))', c.x ),
    'AND', axis( 'COS(RADIANS(dec))*SIN(RADIANS(ra))', c.y ),
    'AND', axis( 'SIN(RADIANS(dec))', c.z ),
    'ORDER BY plx_value DESC'
  ].join( ' ' );

  const rows = await runQuery( adql );

  const neighbours = rows
    .filter( row => row.objectType == null || !PLANET_TYPES.includes( row.objectType ) )
    .map( row => toNeighbour( row, centre ) )
    .filter( n => n.distanceLy <= radiusLy )
    .sort( ( a, b ) => a.distanceLy - b.distanceLy );

  return dedupe( neighbours ).slice( 0, limit );
}

/** Look one object up by name, for a targeted scan. */
export async function lookupByName( name: string, from: Vector3 ): Promise<StellarNeighbour | null> {
  // Escape single quotes for ADQL by doubling them - Qo'noS and friends.
  const safe = name.replace( /'/g, "''" );

  const adql = 'SELECT TOP 1 main_id, ra, dec, plx_value, sp_type, otype_txt FROM basic '
    + 'JOIN ident ON oidref = oid '
    + `WHERE id = '${ safe }' AND plx_value > 0`;

  const rows = await runQuery( adql );
  if ( rows.length === 0 ) return null;

  return toNeighbour( rows[0], from );
}

/** Is this point close enough to Sol for catalogue parallaxes to mean anything? */
export function inCatalogueRange( position: Vector3 ): boolean {
  return distance( position, SOL ) <= SIMBAD_MAX_RANGE_LY;
}

/** Wrap a lookup so a catalogue outage degrades the report rather than failing it. */
export async function safely<T>( label: string, work: () => Promise<T>, fallback: T ): Promise<T> {
  try {
    return await work();
  }
  catch ( err ) {
    Utility.log( 'warn', `[ASTRO] ${ label } failed: ${ ( err as Error ).message }` );
    return fallback;
  }
}

export default {
  coneSearch,
  lookupByName,
  inCatalogueRange,
  tidyName,
  safely,
  SIMBAD_MAX_RANGE_LY
};
