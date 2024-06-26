// -- MESSAGE EVENT --

// Imports
import { type Message } from 'discord.js';
import Utility from '../Subsystems/Utilities/SysUtils.js';
import GuildUtils from '../Subsystems/Utilities/GuildUtilities.js';
import { type LCARSClient } from '../Subsystems/Auxiliary/LCARSClient';

// Exports
export default {
  name: 'messageCreate',
  execute: async ( LCARS47: LCARSClient, msg: Message ) => {
    if ( msg.author.bot || ( msg.author.id === LCARS47.user?.id ) ) return;
    Utility.log( 'proc', '[EVENT] [MSG-CREATE] Received a new message.' );

    // Check against channel lists
    const specData = GuildUtils.isSpecChannel( msg.channelId );
    if ( specData != null ) {
      Utility.log( 'proc', `[EVENT] [MSG-CREATE] Triggered spec channel (${specData.name})!` );
      await GuildUtils.handleSpecResponse( specData.name, LCARS47, msg );
    }
  }
};
