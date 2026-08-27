// ---- Ship Navigation Interfaces ----
// Types for the ship's position in the Galactic Standard Reference Frame,
// its operating status, and any voyage currently under way.

// A point or direction in the GSRF, in light years.
export interface Vector3 {
  x: number
  y: number
  z: number
}

// The four galactic quadrants.
export type Quadrant = 'Alpha' | 'Beta' | 'Gamma' | 'Delta';

/**
 * What the ship is doing.
 *
 * `transit` is the only status where `ShipPosition.position` is not the whole
 * truth - see ResolvedPosition.
 */
export type ShipStatus = 'docked' | 'orbit' | 'idle' | 'transit';

// Where a point falls in the quadrant / sector block / sector hierarchy.
export interface SectorAddress {
  quadrant: Quadrant
  // Sector grid indices. Signed; the origin cell is Sol's.
  grid: Vector3
  // Sector block number, a bijection of the signed block index triple.
  block: number
  // Position within the block, 0-99.
  index: number
  // Canon-style designation, e.g. '001' for the Sol sector.
  designation: string
}

/**
 * A voyage in progress. Never mutated - a speed change rewrites it wholesale as
 * a fresh leg from wherever the ship had reached, which keeps the "position is
 * derived from two timestamps" invariant intact.
 */
export interface TransitPlan {
  /** Start of the CURRENT leg. Interpolation runs from here. */
  origin: Vector3
  /**
   * Where the voyage actually set out from.
   *
   * Absent on a plan that has never had its speed changed, in which case it is
   * the same as `origin`. Kept so progress can be reported across the whole
   * voyage rather than resetting at every speed change.
   */
  voyageOrigin?: Vector3
  destination: Vector3
  // Azimuth, degrees, 0-359.9. 000 points at the galactic core.
  bearing: number
  // Elevation, degrees, 0-359.9. Canon 'mark' notation.
  mark: number
  /** Distance of the current leg, not necessarily of the whole voyage. */
  distanceLy: number
  warpFactor: number
  /** When the CURRENT leg began - the last speed change, or departure. */
  departedAt: Date
  /**
   * When the voyage itself began.
   *
   * Absent on a plan that has never had its speed changed, in which case it is
   * the same as `departedAt`. Without it a speed change would erase any record
   * of when the ship actually set out.
   */
  voyageDepartedAt?: Date
  etaAt: Date
  // Discord user id of whoever gave the order.
  orderedBy: string
}

/**
 * The persisted ship state. Singleton document keyed { id: 1 }, matching the
 * rds_status convention.
 */
export interface ShipPosition {
  id: 1
  status: ShipStatus
  /** GSRF, light years. Authoritative whenever status !== 'transit'. */
  position: Vector3
  /** Present only while status === 'transit'. */
  transit?: TransitPlan
  /** Free text for docked/orbit, e.g. 'Earth'. */
  anchorage?: string
  updatedAt: Date
  updatedBy: string
}

/**
 * The ship's state as of a given instant.
 *
 * In transit, `position` is interpolated from the transit plan's timestamps
 * rather than read from the document - nothing advances position on a timer,
 * so this is the only place a mid-voyage position exists.
 */
export interface ResolvedPosition {
  status: ShipStatus
  position: Vector3
  sector: SectorAddress
  distanceFromCoreLy: number
  distanceFromSolLy: number
  anchorage?: string
  updatedAt: Date
  /** Present only while status === 'transit'. */
  transit?: TransitProgress
}

/**
 * Derived voyage state at a given instant.
 *
 * Everything below spans the WHOLE voyage, including legs run before any speed
 * change. The inherited `distanceLy` and `departedAt` describe only the current
 * leg - use `totalDistanceLy` for anything a reader sees.
 */
export interface TransitProgress extends TransitPlan {
  /** 0 at departure, 1 on arrival. Clamped. */
  progress: number
  /** Distance of the whole voyage, across every leg. */
  totalDistanceLy: number
  travelledLy: number
  remainingLy: number
  remainingMs: number
}
