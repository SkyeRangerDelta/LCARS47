// -- Ship Position Route --
// Where the ship is, right now.
//
// The response is always resolved through Ship_Utilities rather than read
// straight off the stored document: mid-voyage the document still holds the
// departure point, and returning that would be stale by up to weeks.

import exp from 'express';

import type { LCARSClient } from '../../Auxiliary/LCARSClient';
import type { ResolvedPosition } from '../../Auxiliary/Interfaces/ShipInterfaces';
import Utility from '../../Utilities/SysUtils.js';
import Ship from '../../Ship/Ship_Utilities.js';
import type { Route } from '../RouterInterfaces';
import type { ShipPositionResponse } from '../APIInterfaces';
import { NO_AUTH_REQUIRED, envelopeResponse } from '../OpenAPISpec';

function loadRoute( LCARS47: LCARSClient ) {
  const rtr = exp();

  rtr.get( '/ship', ( req, res ) => {
    // Before the client is ready there is no database connection to read from.
    // Mirrors /stats: a bare STATE flag rather than an error, because "not up
    // yet" is not a failure.
    if ( !LCARS47.isReady() ) {
      res.status( 200 ).send( { STATE: false } );
      return;
    }

    Utility.log( 'info', '[API] Received a request for ship position.' );

    Ship.getShipPosition( LCARS47.RDS_CONNECTION )
      .then( doc => {
        // Keep the cached copy on the client in step with what we just read, so
        // command handlers and the AI context do not drift from the API.
        LCARS47.SHIP_POSITION = doc;

        res.status( 200 ).send(
          buildShipResponse( Ship.resolveShipPosition( doc, Date.now() ) )
        );
      } )
      .catch( ( err: Error ) => {
        Utility.log( 'err', '[API] Error resolving ship position.\n' + err.message );
        res.status( 500 ).send(
          { ERROR: true, MESSAGE: 'Internal Server Error: Failed to resolve ship position.\n' + err.message }
        );
      } );
  } );

  return rtr;
}

/**
 * Project a resolved position into the API payload.
 *
 * Exported so the shape can be unit tested without express, a live client or a
 * database - the same reason command embed builders are exported.
 */
export function buildShipResponse( resolved: ResolvedPosition ): ShipPositionResponse {
  const transit = resolved.transit;

  return {
    STATUS: resolved.status,
    POSITION: { ...resolved.position },
    QUADRANT: resolved.sector.quadrant,
    SECTOR: {
      designation: resolved.sector.designation,
      block: resolved.sector.block,
      index: resolved.sector.index,
      grid: { ...resolved.sector.grid }
    },
    DISTANCE_FROM_CORE_LY: resolved.distanceFromCoreLy,
    DISTANCE_FROM_SOL_LY: resolved.distanceFromSolLy,
    ANCHORAGE: resolved.anchorage ?? null,
    TRANSIT: transit == null ? null : {
      BEARING: transit.bearing,
      MARK: transit.mark,
      WARP_FACTOR: transit.warpFactor,
      DISTANCE_LY: transit.totalDistanceLy,
      TRAVELLED_LY: transit.travelledLy,
      REMAINING_LY: transit.remainingLy,
      PROGRESS: transit.progress,
      ORIGIN: { ...( transit.voyageOrigin ?? transit.origin ) },
      DESTINATION: { ...transit.destination },
      DESTINATION_NAME: transit.destinationName ?? null,
      DEPARTED_AT: ( transit.voyageDepartedAt ?? transit.departedAt ).toISOString(),
      ETA_AT: transit.etaAt.toISOString(),
      ORDERED_BY: transit.orderedBy,
      LEG_ORIGIN: { ...transit.origin },
      LEG_DISTANCE_LY: transit.distanceLy,
      LEG_DEPARTED_AT: transit.departedAt.toISOString()
    },
    UPDATED_AT: resolved.updatedAt.toISOString()
  };
}

const rt: Route = {
  name: 'ship',
  router: loadRoute,
  spec: {
    '/ship': {
      get: {
        summary: 'Ship position',
        description:
          'Returns the ship\'s current position in the Galactic Standard Reference Frame, '
          + 'its quadrant and sector designation, and any voyage under way. Mid-voyage the '
          + 'position is interpolated from the transit plan, so repeated calls advance. '
          + 'If the client is not yet ready, only STATE is returned.',
        operationId: 'getShip',
        tags: ['Navigation'],
        security: NO_AUTH_REQUIRED,
        responses: {
          '200': {
            description: 'Current ship position.',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/ShipPositionResponse' },
                    {
                      type: 'object',
                      description: 'Returned when the Discord client is not yet ready.',
                      properties: {
                        STATE: { type: 'boolean', description: 'Always false; the bot is still starting.' }
                      }
                    }
                  ]
                }
              }
            }
          },
          '500': envelopeResponse( 'Ship position could not be resolved.' )
        }
      }
    }
  }
};

export default rt;
