export interface SendMessageBody {
  channelId: string
  content: string
}

/** A point in the Galactic Standard Reference Frame, in light years. */
export interface ShipVectorPayload {
  x: number
  y: number
  z: number
}

export interface ShipSectorPayload {
  designation: string
  block: number
  index: number
  grid: ShipVectorPayload
}

/**
 * A voyage in progress.
 *
 * A speed change splits a voyage into legs. The unprefixed fields describe the
 * whole voyage; the LEG_ ones describe the segment currently being flown, which
 * is what the position is interpolated across.
 */
export interface ShipTransitPayload {
  BEARING: number
  MARK: number
  WARP_FACTOR: number
  DISTANCE_LY: number
  TRAVELLED_LY: number
  REMAINING_LY: number
  PROGRESS: number
  ORIGIN: ShipVectorPayload
  DESTINATION: ShipVectorPayload
  DEPARTED_AT: string
  ETA_AT: string
  ORDERED_BY: string
  LEG_ORIGIN: ShipVectorPayload
  LEG_DISTANCE_LY: number
  LEG_DEPARTED_AT: string
}

/**
 * Payload returned by the ship endpoint.
 *
 * SCREAMING_SNAKE keys to match the existing /stats payload; the nested SECTOR
 * object keeps camelCase because it is a straight projection of SectorAddress.
 */
export interface ShipPositionResponse {
  STATUS: string
  POSITION: ShipVectorPayload
  QUADRANT: string
  SECTOR: ShipSectorPayload
  DISTANCE_FROM_CORE_LY: number
  DISTANCE_FROM_SOL_LY: number
  ANCHORAGE: string | null
  TRANSIT: ShipTransitPayload | null
  UPDATED_AT: string
}
