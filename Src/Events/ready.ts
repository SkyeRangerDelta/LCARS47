// -- READY EVENT --

// Imports
import Utility from '../Subsystems/Utilities/SysUtils.js';
import { type LCARSClient } from '../Subsystems/Auxiliary/LCARSClient.js';
import RDS from '../Subsystems/RemoteDS/RDS_Utilities.js';

import { ActivityType, type TextChannel } from 'discord.js';
import { type StatusInterface } from '../Subsystems/Auxiliary/StatusInterface.js';

const PLDYNID = process.env.PLDYNID;
const LCARSID = process.env.LCARSID;
const ENGINEERING = process.env.ENGINEERING;

// Exports
module.exports = {
  name: 'ready',
  once: true,
  execute: async ( LCARS47: LCARSClient, args?: string[] ) => {
    if ( ( PLDYNID == null ) || ( LCARSID == null ) || ( ENGINEERING == null ) ) {
      throw new Error( 'One or more environment variables are missing.' );
    }

    LCARS47.PLDYN = await LCARS47.guilds.fetch( PLDYNID );
    LCARS47.MEMBER = await LCARS47.PLDYN.members.fetch( LCARSID );
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
    Utility.log( 'proc', `[CLIENT] Current Stardate: ${Utility.stardate()}` );

    const version = process.env.VERSION;

    LCARS47.user?.setPresence( {
      activities: [{ name: 'for stuff | ' + version, type: ActivityType.Listening }],
      status: 'online'
    } );

    if ( process.argv.includes( '--heartbeat' ) ) {
      Utility.log( 'proc', 'Heartbeat done.' );
      return process.exit( 0 );
    }

    LCARS47.RDS_CONNECTION = await RDS.rds_connect();

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

    const engineeringLog = await LCARS47.PLDYN.channels.fetch( ENGINEERING ) as TextChannel;
    await engineeringLog.send( `LCARS47 V${version} is ONLINE.` );
  }
};
