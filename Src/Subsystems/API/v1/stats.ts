import exp from 'express';
import type { LCARSClient } from '../../Auxiliary/LCARSClient';
import Utility from '../../Utilities/SysUtils.js';
import type { StatusInterface } from '../../Auxiliary/Interfaces/StatusInterface';
import RDS_Utilities from '../../RemoteDS/RDS_Utilities';
import type { Route } from '../RouterInterfaces';
import { API_SECURITY_SCHEME, envelopeResponse } from '../OpenAPISpec';
import { requireApiAuth } from '../AuthMiddleware';

function loadRoute( LCARS47: LCARSClient ) {
  const rtr = exp();

  // Authenticated: MEDIA_PLAYER_DATA carries the title a member is playing and
  // the name of whoever asked for it, which makes this member activity rather
  // than service telemetry. The gate deliberately runs ahead of the readiness
  // check below, so an anonymous caller cannot tell a starting bot from a
  // running one either.
  rtr.get( '/stats', requireApiAuth, ( req, res ) => {
    if ( !LCARS47.isReady() ) {
      res.status( 200 ).send(
        { STATE: false }
      );

      return;
    }

    Utility.log( 'info', '[API] Received a request for stats.' );
    buildStats( LCARS47 )
      .then( stats => {
        res.status( 200 ).send( stats );
      } )
      .catch( ( err: Error ) => {
        Utility.log( 'error', '[API] Error building stats.\n' + err.message );
        res.status( 500 ).send(
          { ERROR: true, MESSAGE: 'Internal Server Error: Failed to build stats.\n' + err.message }
        );
      } );
  });

  return rtr;
}

async function buildStats ( LCARS47: LCARSClient ): Promise< StatusInterface | null > {
  Utility.log( 'info', '[API] Loading latest API Stats.' );
  const botStats = await RDS_Utilities.rds_getStatusFull( LCARS47.RDS_CONNECTION );
  botStats.CLIENT_MEM_USAGE = Utility.formatProcess_mem( process.memoryUsage().heapUsed );
  botStats.SYSTEM_LATENCY = LCARS47.ws.ping;

  const timeDiff = Utility.formatMSDiff( botStats.STARTUP_UTC );
  botStats.SESSION_UPTIME = {
    human: timeDiff.toHuman( { unitDisplay: 'long' } ),
    diff: timeDiff.toObject()
  };

  botStats.MEDIA_PLAYER_STATE = LCARS47.MEDIA_PLAYER.isActive();

  const nowPlaying = LCARS47.MEDIA_PLAYER.getNowPlaying();
  if ( nowPlaying != null ) {
    botStats.MEDIA_PLAYER_DATA = {
      title: nowPlaying.title,
      url: nowPlaying.url,
      source: nowPlaying.source,
      duration: nowPlaying.duration,
      durationFriendly: nowPlaying.durationFriendly,
      channelOrAlbumLabel: nowPlaying.channelOrAlbumLabel,
      requestedBy: nowPlaying.requestedBy.displayName,
      playStart: nowPlaying.playStart
    };
  }
  else {
    botStats.MEDIA_PLAYER_DATA = { info: 'Nothing playing.' };
  }

  return botStats;
}

const rt: Route = {
  name: 'stats',
  router: loadRoute,
  spec: {
    '/stats': {
      get: {
        summary: 'Bot telemetry',
        description:
          'Returns live LCARS47 statistics: uptime, query counters, memory usage, ' +
          'websocket latency and media player state. If the client is not yet ready, ' +
          'only STATE is returned. Requires a valid auth token, because the media ' +
          'player fields report what a member is playing and who requested it.',
        operationId: 'getStats',
        tags: ['Telemetry'],
        security: [{ [API_SECURITY_SCHEME]: [] }],
        responses: {
          '200': {
            description: 'Current bot telemetry.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/StatusResponse' } }
            }
          },
          '401': envelopeResponse( 'Authentication header was absent or empty.' ),
          '403': envelopeResponse( 'Authentication token was invalid.' ),
          '500': envelopeResponse( 'Statistics could not be assembled.' )
        }
      }
    }
  }
}

export default rt;
