// ---- STAPI Provider ----
// Canon Star Trek astronomical objects, from stapi.co. Free, no key.
//
// STAPI knows what things ARE - planet, star system, nebula, sector - and what
// they sit inside, all the way up to the quadrant. What it does not carry is a
// single coordinate, so it cannot answer "what is near us"; it answers "what is
// this". That is why a scan pairs it with SIMBAD: STAPI supplies the canon
// identity, SIMBAD supplies a real fix when the object is a real star.

import Utility from '../Utilities/SysUtils.js';
import type { CanonObject } from './AstroInterfaces.js';

const STAPI_SEARCH = 'https://stapi.co/api/v1/rest/astronomicalObject/search';

/** Scans are deferred, so they can wait. */
const REQUEST_TIMEOUT_MS = 12_000;

/** Autocomplete has three seconds total, so it gets a much shorter leash. */
const AUTOCOMPLETE_TIMEOUT_MS = 2_000;

interface StapiSearchResponse {
  astronomicalObjects?: {
    uid?: unknown
    name?: unknown
    astronomicalObjectType?: unknown
    location?: { uid?: unknown, name?: unknown } | null
  }[]
}

function parseObject( raw: NonNullable<StapiSearchResponse['astronomicalObjects']>[number] ): CanonObject | null {
  if ( typeof raw.uid !== 'string' || typeof raw.name !== 'string' ) return null;

  const location = raw.location != null
    && typeof raw.location.uid === 'string'
    && typeof raw.location.name === 'string'
    ? { uid: raw.location.uid, name: raw.location.name }
    : null;

  return {
    uid: raw.uid,
    name: raw.name,
    objectType: typeof raw.astronomicalObjectType === 'string'
      ? raw.astronomicalObjectType
      : null,
    location
  };
}

async function search( name: string, pageSize: number, timeoutMs: number ): Promise<CanonObject[]> {
  const response = await fetch( `${ STAPI_SEARCH }?pageSize=${ pageSize }`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams( { name } ).toString(),
    signal: AbortSignal.timeout( timeoutMs )
  } );

  if ( !response.ok ) throw new Error( `STAPI returned HTTP ${ response.status }` );

  const body = await response.json() as StapiSearchResponse;

  return ( body.astronomicalObjects ?? [] )
    .map( parseObject )
    .filter( ( o ): o is CanonObject => o != null );
}

/**
 * Everything STAPI knows by that name.
 *
 * A search for "Vulcan" legitimately returns the planet, the system, the sector
 * and a couple of regions, so the caller gets the list and decides.
 */
export async function searchByName( name: string ): Promise<CanonObject[]> {
  if ( name.trim() === '' ) return [];

  return await search( name.trim(), 50, REQUEST_TIMEOUT_MS );
}

/**
 * Pick the entry a scan should lead with.
 *
 * Prefers a concrete body over the abstractions around it: someone asking about
 * Vulcan means the planet, not "Vulcan border".
 */
export function pickPrimary( objects: readonly CanonObject[], query: string ): CanonObject | null {
  if ( objects.length === 0 ) return null;

  const key = query.trim().toLowerCase();
  const exact = objects.filter( o => o.name.toLowerCase() === key );
  const pool = exact.length > 0 ? exact : objects;

  const RANK: readonly string[] = [
    'M_CLASS_PLANET',
    'PLANET',
    'STAR',
    'STAR_SYSTEM',
    'NEBULA',
    'SECTOR',
    'REGION'
  ];

  const scored = [...pool].sort( ( a, b ) => {
    const rankOf = ( o: CanonObject ): number => {
      const index = o.objectType == null ? -1 : RANK.indexOf( o.objectType );
      return index === -1 ? RANK.length : index;
    };

    return rankOf( a ) - rankOf( b );
  } );

  return scored[0];
}

/**
 * Autocomplete rows for a scan target.
 *
 * Never throws and never blocks past its timeout: a slow third party must not
 * be what makes the option box hang.
 */
export async function suggestObjects( query: string ): Promise<{ name: string, value: string }[]> {
  if ( query.trim().length < 2 ) return [];

  try {
    const objects = await search( query.trim(), 25, AUTOCOMPLETE_TIMEOUT_MS );

    return objects.slice( 0, 25 ).map( o => ( {
      name: `${ o.name }${ o.objectType == null ? '' : ` — ${ describeType( o.objectType ) }` }`
        .slice( 0, 100 ),
      value: o.name.slice( 0, 100 )
    } ) );
  }
  catch ( err ) {
    Utility.log( 'warn', `[ASTRO] STAPI autocomplete failed: ${ ( err as Error ).message }` );
    return [];
  }
}

/** STAPI shouts its enum values; a report should not. */
export function describeType( objectType: string ): string {
  return objectType
    .toLowerCase()
    .split( '_' )
    .join( ' ' )
    .replace( /^m class/, 'M-class' )
    .replace( /^([a-z])/, c => c.toUpperCase() );
}

export default {
  searchByName,
  pickPrimary,
  suggestObjects,
  describeType
};
