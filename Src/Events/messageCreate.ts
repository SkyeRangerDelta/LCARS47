// -- MESSAGE EVENT --

// Imports
import { type Message } from 'discord.js';
import Utility from '../Subsystems/Utilities/SysUtils.js';
import GuildUtils from '../Subsystems/Utilities/GuildUtilities.js';
import Stats from '../Subsystems/Stats/Stats_Utilities.js';
import { type LCARSClient } from '../Subsystems/Auxiliary/LCARSClient';

// Exports
export default {
  name: 'messageCreate',
  execute: async ( LCARS47: LCARSClient, msg: Message ) => {
    if ( msg.author.bot || ( msg.author.id === LCARS47.user?.id ) ) return;
    Utility.log( 'proc', '[EVENT] [MSG-CREATE] Received a new message.' );

    // Guild traffic only. A DM is not server participation, and counting it
    // would let anyone inflate their own numbers in private.
    if ( msg.guildId != null ) {
      Stats.recordActivity( LCARS47.RDS_CONNECTION, msg.author.id, msg.author.username, 'MESSAGES' );
    }

    // Check against channel lists
    const specData = GuildUtils.isSpecChannel( msg.channelId );
    if ( specData != null ) {
      Utility.log( 'proc', `[EVENT] [MSG-CREATE] Triggered spec channel (${specData.name})!` );
      await GuildUtils.handleSpecResponse( specData.name, LCARS47, msg );
    }
  }
};
