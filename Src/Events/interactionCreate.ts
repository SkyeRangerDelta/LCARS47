// -- INTERACTION EVENT --

// Imports
import { type BaseInteraction } from 'discord.js';
import { type LCARSClient } from '../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../Subsystems/Utilities/SysUtils.js';
import RDS_Utilities from '../Subsystems/RemoteDS/RDS_Utilities.js';

// Exports
export default {
  name: 'interactionCreate',
  async execute ( LCARS47: LCARSClient, int: BaseInteraction ) {
    if ( !int.isChatInputCommand() ) return;

    const cmd = LCARS47.CMD_INDEX.get( int.commandName );
    if ( cmd == null ) return await int.reply( 'No command!' );

    try {
      Utility.log( 'info', `[CMD-HANDLER] New command received. (${int.commandName})` );
      await cmd.execute( LCARS47, int );

      // Command done, update stats
      await RDS_Utilities.rds_update( LCARS47.RDS_CONNECTION, 'rds_status', { id: 1 }, { $inc: { CMD_QUERIES: 1 } } );
    }
    catch ( cmdErr ) {
      if ( int.deferred || int.replied ) {
        await int.followUp( `*Bzzt* Sector Failure!\n${ cmdErr as string }` );
        Utility.log( 'err', `[INT-HANDLER] Cmd execution failed!\n${ cmdErr as string} ` );

        // Command failed, update stats
        await RDS_Utilities.rds_update( LCARS47.RDS_CONNECTION, 'rds_status', { id: 1 }, { $inc: { CMD_QUERIES_FAILED: 1 } } );
      }
      else {
        await int.reply( `Looks like something is busted on the subnet.\n${ cmdErr as string }`);

        // Command failed, update stats
        await RDS_Utilities.rds_update( LCARS47.RDS_CONNECTION, 'rds_status', { id: 1 }, { $inc: { CMD_QUERIES_FAILED: 1 } } );
      }
    }
  }
};
