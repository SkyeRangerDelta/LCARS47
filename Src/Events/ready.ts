// -- READY EVENT --

// Imports
import Utility from '../Subsystems/Utilities/SysUtils.js';
import { type LCARSClient } from '../Subsystems/Auxiliary/LCARSClient.js';
import RDS from '../Subsystems/RemoteDS/RDS_Utilities.js';
import Beszel from '../Subsystems/RemoteDS/Beszel_Connect.js';
import BeszelUtils from '../Subsystems/RemoteDS/Beszel_Utilities.js';
import { type StatusInterface } from '../Subsystems/Auxiliary/Interfaces/StatusInterface.js';
import { getEnv, isFeatureEnabled } from '../Subsystems/Utilities/EnvUtils.js';

import { ActivityType, type TextChannel } from 'discord.js';

const env = getEnv();

// Exports
export default {
  name: 'clientReady',
  once: true,
  execute: async ( LCARS47: LCARSClient, args?: string[] ) => {

    if ( args != undefined && args?.length > 0 ) {
      Utility.log( 'info', '[READY] Received arguments for startup.' );
    }

    LCARS47.PLDYN = await LCARS47.guilds.fetch( env.PLDYNID );
    LCARS47.MEMBER = await LCARS47.PLDYN.members.fetch( env.LCARSID );
    LCARS47.MEDIA_QUEUE = new Map();
    LCARS47.CLIENT_STATS = {
      CLIENT_MEM_USAGE: 0,
      CMD_QUERIES: 0,
      CMD_QUERIES_FAILED: 0,
      SYSTEM_LATENCY: 0,
      MEDIA_PLAYER_DATA: {},
      MEDIA_PLAYER_STATE: false,
      QUERIES: 0,
      SESSION: 0,
      SESSION_UPTIME: 0,
      STARTUP_TIME: '',
      STARTUP_UTC: 0,
      VERSION: '',
      STATE: false
    } satisfies StatusInterface;

    Utility.log( 'proc', '[CLIENT] IM ALIVE!' );
    Utility.log( 'proc', `[CLIENT] Current Stardate: ${Utility.stardate()} - Shipboard time: ${ Utility.shipboardTime() }` );

    const version = Utility.getVersion();

    LCARS47.user?.setPresence( {
      activities: [{ name: 'for stuff | ' + `V${version}`, type: ActivityType.Watching }],
      status: 'online'
    } );

    if ( process.argv.includes( '--heartbeat' ) ) {
      Utility.log( 'proc', 'Heartbeat done.' );
      return process.exit( 0 );
    }

    LCARS47.RDS_CONNECTION = await RDS.rds_connect();

    // Initialize Beszel client if feature is enabled
    if ( isFeatureEnabled( 'beszel' ) ) {
      try {
        LCARS47.BESZEL_CLIENT = await Beszel.beszel_connect();

        // Fetch initial systems list
        LCARS47.BESZEL_SYSTEMS = await BeszelUtils.beszel_getSystems(LCARS47.BESZEL_CLIENT);
        Utility.log('proc', `[BESZEL] Loaded ${LCARS47.BESZEL_SYSTEMS.length} systems for autocomplete cache`);
      } catch (beszelErr) {
        Utility.log('warn', `[BESZEL] Failed to initialize Beszel client: ${(beszelErr as Error).message}`);
        Utility.log('warn', '[BESZEL] Server monitoring features will be unavailable.');
        LCARS47.BESZEL_SYSTEMS = []; // Empty array as fallback
      }
    }
    else {
      Utility.log( 'info', '[BESZEL] Feature not enabled - skipping initialization.' );
      LCARS47.BESZEL_SYSTEMS = [];
    }

    Utility.log( 'info', '[CLIENT] Getting old stats page.' );
    const oldBotData = await RDS.rds_getStatusFull( LCARS47.RDS_CONNECTION );

    Utility.log( 'info', '[CLIENT] Sending updated stats page.' );
    const startTime = Utility.flexTime();
    const startUTC = Date.now();
    const updateData = {
      $set: {
        STATE: true,
        VERSION: version,
        STARTUP_TIME: startTime,
        STARTUP_UTC: startUTC
      },
      $inc: {
        SESSION: 1,
        QUERIES: 1
      }
    };

    const lastStartTime: string = Utility.formatMSDiff( oldBotData.STARTUP_UTC ).toHuman( { unitDisplay: 'long' } );
    Utility.log( 'info', '[CLIENT] Time since last boot sequence:\n' + lastStartTime );

    const res = await RDS.rds_update( LCARS47.RDS_CONNECTION, 'rds_status', { id: 1 }, updateData );
    if ( !res ) {
      throw new Error( 'RDS status update failed!' );
    }

    const engineeringLog = await LCARS47.PLDYN.channels.fetch( env.ENGINEERING ) as TextChannel;
    await engineeringLog.send( `LCARS ${version} is ONLINE.` );
  }
};
