// ---- Procedural Sensor Readings ----
// The floor under the whole subsystem: whatever the remote catalogues do, the
// ship can always say something about where she is.
//
// Everything here is a pure function of the sector, so a sector always reads
// identically however often it is scanned, and a restart changes nothing. That
// is the point - readings that drifted between scans would be obviously fake,
// and readings that persisted would need storing.
//
// These are invented, and the report labels them as computed rather than
// measured. What makes them defensible is that they vary the way real space
// does: denser and hotter toward the core, sparser out in the halo.

import { SOL_GALACTIC_RADIUS_LY, magnitude } from '../Ship/Ship_Navigation.js';
import type { SectorAddress } from '../Auxiliary/Interfaces/ShipInterfaces.js';
import type { SensorReadings } from './AstroInterfaces.js';

/**
 * Mix three signed sector indices into a 32-bit seed.
 *
 * A plain sum or xor would collide badly on a grid - (1,2,3) and (3,2,1) would
 * read the same - so each axis gets its own large odd multiplier before mixing.
 */
function hashSector( x: number, y: number, z: number ): number {
  let h = 0x9e3779b9;

  for ( const value of [x, y, z] ) {
    h ^= Math.imul( value | 0, 0x85ebca6b );
    h = Math.imul( h ^ ( h >>> 13 ), 0xc2b2ae35 );
    h = ( h ^ ( h >>> 16 ) ) >>> 0;
  }

  return h >>> 0;
}

/** mulberry32: small, fast, and good enough for flavour that must be repeatable. */
function makeRng( seed: number ): () => number {
  let state = seed >>> 0;

  return () => {
    state = ( state + 0x6d2b79f5 ) >>> 0;
    let t = Math.imul( state ^ ( state >>> 15 ), 1 | state );
    t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
    return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
  };
}

const SPECTRAL_CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const;

/**
 * Relative frequency of each spectral class.
 *
 * Roughly the real initial mass function: M dwarfs dominate everywhere, O stars
 * are vanishingly rare. Keeping this honest costs nothing and means the reports
 * do not read like a list of blue giants.
 */
const SPECTRAL_WEIGHTS = [0.00003, 0.001, 0.006, 0.03, 0.076, 0.121, 0.766];

const SUBSPACE_CONDITIONS = [
  'Nominal. Subspace metric stable.',
  'Minor subspace turbulence. Warp field compensating.',
  'Mild gravimetric distortion. Within navigational tolerance.',
  'Clear. No measurable subspace gradient.',
  'Slight subspace flux. Long-range sensor resolution reduced.'
];

const PHENOMENA = [
  'Faint hydrogen emission nebula, unclassified.',
  'Cold molecular cloud on the periphery of the sector.',
  'Residual ionisation trail, origin unknown.',
  'Weak gravimetric anomaly. No mass concentration detected.',
  'Localised subspace shear. Recommend caution above warp 9.',
  'Dust lane crossing the sector. Optical sensors degraded.',
  'Uncatalogued brown dwarf, low confidence.',
  'Micrometeoroid stream. Navigational deflector at nominal load.'
];

/** How likely a given sector is to hold anything worth remarking on. */
const PHENOMENON_CHANCE = 0.35;

/** Pick from a list of weights, returning the chosen index. */
function weightedIndex( roll: number, weights: readonly number[] ): number {
  const total = weights.reduce( ( sum, w ) => sum + w, 0 );
  let threshold = roll * total;

  for ( let i = 0; i < weights.length; i++ ) {
    threshold -= weights[i];
    if ( threshold <= 0 ) return i;
  }

  return weights.length - 1;
}

/**
 * Stellar density falls off with distance from the galactic core.
 *
 * A crude exponential disc: the sectors around Sol land near the canon figure of
 * roughly forty stars, the inner galaxy runs far denser, and the outer halo
 * thins to almost nothing. Returns a multiplier on the Sol-neighbourhood count.
 */
function densityFactor( distanceFromCoreLy: number ): number {
  const SCALE_LENGTH_LY = 11000;

  return Math.exp( ( SOL_GALACTIC_RADIUS_LY - distanceFromCoreLy ) / SCALE_LENGTH_LY );
}

function describeDensity( starCount: number ): string {
  if ( starCount < 5 ) return 'Sparse — deep interstellar void';
  if ( starCount < 20 ) return 'Thin';
  if ( starCount < 60 ) return 'Typical for this arm';
  if ( starCount < 200 ) return 'Dense';
  return 'Extremely dense — core population';
}

/** Readings for the sector containing a point. Deterministic in that sector. */
export function readSector( sector: SectorAddress, position: { x: number, y: number, z: number } ): SensorReadings {
  const rng = makeRng( hashSector( sector.grid.x, sector.grid.y, sector.grid.z ) );

  // Draw in a fixed order - every reading below depends on the ones above it
  // having consumed exactly one value, or the sector stops being reproducible.
  const densityRoll = rng();
  const spectralRoll = rng();
  const particleRoll = rng();
  const radiationRoll = rng();
  const subspaceRoll = rng();
  const phenomenonRoll = rng();
  const phenomenonPick = rng();

  const factor = densityFactor( magnitude( position ) );
  const starCount = Math.max(
    0,
    Math.round( ( 18 + densityRoll * 45 ) * factor )
  );

  return {
    starCount,
    stellarDensity: describeDensity( starCount ),
    dominantSpectralClass: SPECTRAL_CLASSES[weightedIndex( spectralRoll, SPECTRAL_WEIGHTS )],
    particleDensityPerCm3: Number( ( 0.05 + particleRoll * 1.6 * factor ).toFixed( 2 ) ),
    backgroundRadiationMrem: Number( ( 0.8 + radiationRoll * 4.5 * Math.sqrt( factor ) ).toFixed( 2 ) ),
    subspaceConditions: SUBSPACE_CONDITIONS[
      Math.floor( subspaceRoll * SUBSPACE_CONDITIONS.length )
    ],
    phenomenon: phenomenonRoll < PHENOMENON_CHANCE
      ? PHENOMENA[Math.floor( phenomenonPick * PHENOMENA.length )]
      : null
  };
}

export default { readSector };
