// ---- Ship Destinations ----
// Turns what someone typed into a point in space.
//
// This is the seam where points of interest will land. Today it resolves a
// small catalogue of reference points plus raw GSRF coordinates; when the canon
// location catalogue arrives it plugs in here, and every caller - the command,
// its autocomplete, the planner - keeps working unchanged.

import { SOL } from './Ship_Navigation.js';
import type { Vector3 } from '../Auxiliary/Interfaces/ShipInterfaces.js';

/** A resolved target. `name` is absent when the input was raw coordinates. */
export interface Destination {
  position: Vector3
  name?: string
}

export interface CataloguePoint {
  name: string
  /** Lower-case strings that also resolve to this point. */
  aliases: readonly string[]
  position: Vector3
  /** One line for the autocomplete row. */
  description: string
}

/**
 * Known reference points.
 *
 * Deliberately short. These are the two points whose GSRF coordinates are fixed
 * by the frame itself rather than by a catalogue we have not built yet, so they
 * are the only ones that can be stated without inventing anything.
 */
const CATALOGUE: readonly CataloguePoint[] = [
  {
    name: 'Sol',
    aliases: ['sol', 'earth', 'terra', 'home', 'sector 001', 'sol system'],
    position: SOL,
    description: 'Sector 001, Alpha Quadrant — home'
  },
  {
    name: 'Galactic Centre',
    aliases: [
      'galactic centre',
      'galactic center',
      'core',
      'galactic core',
      'sagittarius a*',
      'sgr a*'
    ],
    position: { x: 0, y: 0, z: 0 },
    description: 'The origin of the reference frame — 30,000 ly from Sol'
  }
];

export function listDestinations(): readonly CataloguePoint[] {
  return CATALOGUE;
}

function normalise( input: string ): string {
  return input.trim().toLowerCase().replace( /\s+/g, ' ' );
}

/** Look up a catalogue point by name or alias. */
export function findCataloguePoint( input: string ): CataloguePoint | null {
  const key = normalise( input );

  return CATALOGUE.find(
    point => point.name.toLowerCase() === key || point.aliases.includes( key )
  ) ?? null;
}

/**
 * Parse a GSRF coordinate triple.
 *
 * Tolerant of the shapes people actually type: `29980, 0, 0`, `29980 0 0`,
 * `(29980, 0, 0)`, `[29980; 0; 0]`. Returns null rather than a partial guess.
 */
export function parseCoordinates( input: string ): Vector3 | null {
  const cleaned = input.trim().replace( /^[([{]/, '' ).replace( /[)\]}]$/, '' );
  const parts = cleaned.split( /[\s,;]+/ ).filter( p => p.length > 0 );

  if ( parts.length !== 3 ) return null;

  const [x, y, z] = parts.map( Number );
  if ( ![x, y, z].every( Number.isFinite ) ) return null;

  return { x, y, z };
}

/**
 * Resolve whatever was typed into a target.
 *
 * Catalogue names are tried first so a point of interest can never be shadowed
 * by something that happens to parse as three numbers.
 */
export function resolveDestination( input: string ): Destination | null {
  const point = findCataloguePoint( input );
  if ( point != null ) return { position: { ...point.position }, name: point.name };

  const coordinates = parseCoordinates( input );
  if ( coordinates != null ) return { position: coordinates };

  return null;
}

/** Discord autocomplete rows for the destination option. Capped at 25 by Discord. */
export function suggestDestinations( query: string ): { name: string, value: string }[] {
  const key = normalise( query );

  const matches = CATALOGUE.filter(
    point => key === ''
      || point.name.toLowerCase().includes( key )
      || point.aliases.some( alias => alias.includes( key ) )
  );

  const rows = matches.map( point => ( {
    name: `${ point.name } — ${ point.description }`.slice( 0, 100 ),
    value: point.name
  } ) );

  // Anything that already parses as coordinates is offered back verbatim, so
  // typing a triple does not look unsupported just because it matches no name.
  if ( query.trim() !== '' && parseCoordinates( query ) != null ) {
    rows.unshift( { name: `Coordinates ${ query.trim() }`.slice( 0, 100 ), value: query.trim() } );
  }

  return rows.slice( 0, 25 );
}

export default {
  listDestinations,
  findCataloguePoint,
  parseCoordinates,
  resolveDestination,
  suggestDestinations
};
