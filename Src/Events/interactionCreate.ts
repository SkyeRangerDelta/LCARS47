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
    // Handle autocomplete interactions
    if ( int.isAutocomplete() ) {
      const cmd = LCARS47.CMD_INDEX.get( int.commandName );
      if ( cmd == null ) return;

      try {
        // Type assertion: autocomplete-enabled commands handle both interaction types internally
        await cmd.execute( LCARS47, int );
      } catch ( autocompleteErr ) {
        Utility.log( 'err', `[INT-HANDLER] Autocomplete failed: ${ autocompleteErr as string }` );
      }
      return;
    }

    // Handle button interactions
    if ( int.isButton() ) {
      const customId = int.customId;

      // Route buttons based on prefix (e.g., "dabo_spin_123" -> "dabo" command)
      const cmdName = customId.split( '_' )[0];
      const cmd = LCARS47.CMD_INDEX.get( cmdName );

      if ( cmd == null || cmd.handleButton == null ) {
        Utility.log( 'warn', `[INT-HANDLER] No button handler for: ${customId}` );
        return;
      }

      try {
        Utility.log( 'info', `[INT-HANDLER] Button interaction received: ${customId}` );
        await cmd.handleButton( LCARS47, int );
      } catch ( buttonErr ) {
        Utility.log( 'err', `[INT-HANDLER] Button handler failed: ${ buttonErr as string }` );
        if ( !int.replied && !int.deferred ) {
          await int.reply( { content: 'Button interaction failed!', ephemeral: true } );
        }
      }
      return;
    }

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
