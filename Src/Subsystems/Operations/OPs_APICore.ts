// -- API Core --

// Imports
import Utility from '../Utilities/SysUtils.js';
import exp, { type Application, type Request, type Response } from 'express';
import { type StatusInterface } from '../Auxiliary/Interfaces/StatusInterface.js';
import RDS_Utilities from '../RemoteDS/RDS_Utilities.js';
import { type LCARSClient } from '../Auxiliary/LCARSClient.js';
import { getEnv } from '../Utilities/EnvUtils.js';

const env = getEnv();

// Exports
const APICore = {
  loadAPI
};

export default APICore;

// Functions
function loadAPI ( LCARS47: LCARSClient ): void {
  const rtr: Application = exp();

  rtr.get( '/stats', ( req: Request, res: Response ) => {
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
  } );

  rtr.listen( env.API_PORT, () => {
    Utility.log( 'info', `[API] Service online at ${env.API_PORT}` );
  } );
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

  const mediaQueue = LCARS47.MEDIA_QUEUE.get( env.PLDYNID );
  botStats.MEDIA_PLAYER_STATE = !( mediaQueue == null );

  if ( ( mediaQueue?.isPlaying ) === true ) {
    botStats.MEDIA_PLAYER_DATA = mediaQueue.songs[0];
  }
  else {
    botStats.MEDIA_PLAYER_DATA = {
      info: 'Nothing playing.'
    };
  }

  return botStats;
}
