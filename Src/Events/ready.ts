// -- READY EVENT --

// Imports
import Utility from '../Subsystems/Utilities/SysUtils.js';
import { type LCARSClient } from '../Subsystems/Auxiliary/LCARSClient.js';
import RDS from '../Subsystems/RemoteDS/RDS_Utilities.js';
import { type StatusInterface } from '../Subsystems/Auxiliary/Interfaces/StatusInterface.js';

import { ActivityType, type TextChannel } from 'discord.js';
import * as fs from 'node:fs';

const PLDYNID = process.env.PLDYNID;
const LCARSID = process.env.LCARSID;
const ENGINEERING = process.env.ENGINEERING;

interface pkgData {
  version: string;
}

// Exports
module.exports = {
  name: 'ready',
  once: true,
  execute: async ( LCARS47: LCARSClient, args?: string[] ) => {
    if ( ( PLDYNID == null ) || ( LCARSID == null ) || ( ENGINEERING == null ) ) {
      throw new Error( 'One or more environment variables are missing.' );
    }

    if ( args != undefined && args?.length > 0 ) {
      Utility.log( 'info', '[READY] Received arguments for startup.' );
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

    const pkgData = JSON.parse( fs.readFileSync( './package.json', 'utf8' ) ) as pkgData;
    const version = parseVersion( `${pkgData.version}` );

    LCARS47.user?.setPresence( {
      activities: [{ name: 'for stuff | ' + `V${version}`, type: ActivityType.Watching }],
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
    await engineeringLog.send( `LCARS V${version} is ONLINE.` );
  }
};

/**
 * Returns a version that is 47 friendly.
 * The incoming string from package is a either standard semantic versioning or an experimental tag
 * in the form of "x.y.z-<tag>". If this is an experimental tag, return a 47 friendly version.
 * 47 friendly versions are in the form of "47.x.y.z (Exp)" where Exp is only show if it's experimental.
 * @param version
 */
function parseVersion ( version: string ): string {
  const exp = version.split( '-' );
  if ( exp.length > 1 ) {
    const expTag = exp[1].split( '.' );
    return `47.${exp[0]} (EXP.${expTag[1]})`;
  }

  return `47.${version}`;
}
