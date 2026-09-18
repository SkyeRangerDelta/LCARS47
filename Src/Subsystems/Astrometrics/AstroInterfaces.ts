// ---- Astrometrics Interfaces ----
// Shared types for the sensor report and its data sources.

import type { ResolvedPosition, Vector3 } from '../Auxiliary/Interfaces/ShipInterfaces.js';

/** Where a piece of information came from. Reports say so, rather than blurring the line. */
export type AstroSource = 'simbad' | 'stapi' | 'procedural';

/** A real object with a real position, resolved into the ship's frame. */
export interface StellarNeighbour {
  /** Display name, tidied of catalogue prefixes. */
  name: string
  /** GSRF, light years. */
  position: Vector3
  /** Range from the ship. */
  distanceLy: number
  /** Bearing and mark from the ship, in the ship's local navigation frame. */
  bearing: number
  mark: number
  /** MK spectral type, when the catalogue has one. */
  spectralType: string | null
  /** Catalogue object type, e.g. 'PM*' for a high proper-motion star. */
  objectType: string | null
  source: AstroSource
}

/** A Star Trek object as STAPI knows it. No coordinates - STAPI carries none. */
export interface CanonObject {
  uid: string
  name: string
  objectType: string | null
  /** Parent body: a star system, a sector, or a quadrant. */
  location: { uid: string, name: string } | null
}

/**
 * Sensor readings for a volume of space.
 *
 * Generated deterministically from the sector, so the same sector always reads
 * the same however often it is scanned. These are not measurements of anything;
 * they are consistent invention, and the report says so.
 */
export interface SensorReadings {
  starCount: number
  stellarDensity: string
  dominantSpectralClass: string
  particleDensityPerCm3: number
  backgroundRadiationMrem: number
  subspaceConditions: string
  /** An anomaly worth mentioning, when the sector has one. */
  phenomenon: string | null
}

/** Everything /astrometrics report renders. */
export interface AstrometricsReport {
  position: ResolvedPosition
  readings: SensorReadings
  /** Real objects within sensor range, nearest first. */
  neighbours: StellarNeighbour[]
  /** Why the catalogue sweep returned nothing, when that needs explaining. */
  catalogueNote: string | null
}

/** Everything /astrometrics scan renders. */
export interface ScanResult {
  query: string
  /** What Star Trek says the object is. */
  canon: CanonObject | null
  /** Where it actually is, if a real catalogue could place it. */
  fix: StellarNeighbour | null
  /** How the fix was obtained, or why there is none. */
  note: string | null
}
