import exp from 'express';
import type { LCARSClient } from '../../Auxiliary/LCARSClient';
import Utility from '../../Utilities/SysUtils.js';
import type { StatusInterface } from '../../Auxiliary/Interfaces/StatusInterface';
import RDS_Utilities from '../../RemoteDS/RDS_Utilities';

function loadRoute( LCARS47: LCARSClient ) {
  const rtr = exp();

  rtr.get( '/stats', ( req, res ) => {
    if ( !LCARS47.isReady() ) {
      res.status( 200 ).send(
        { STATE: false }
      );
    }

    Utility.log( 'info', '[API] Received a request for stats.' );
    buildStats( LCARS47 )
      .then( stats => {
        res.status( 200 ).send( stats );
      } )
      .catch( ( err: Error ) => {
        Utility.log( 'error', '[API] Error building stats.\n' + err.message );
        res.status( 500 ).send(
          { STATE: false }
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

const rt = {
  name: 'stats',
  router: loadRoute
}

export default rt;
