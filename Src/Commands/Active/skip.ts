// -- SKIP --
// Moves media player to next song in queue.

// Imports
import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import { type ChatInputCommandInteraction, type GuildMember, type InteractionResponse } from 'discord.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';

import PlayerUtils from './play.js';

const PLDYNID = process.env.PLDYNID ?? '';

// Globals
const data = new SlashCommandBuilder()
  .setName( 'skip' )
  .setDescription( 'Moves the music player on to the next song in queue (if any).' );

// Functions
async function execute ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<InteractionResponse> {
  Utility.log( 'info', '[MEDIA-PLAYER] Received a skip command.' );

  const serverQueue = LCARS47.MEDIA_QUEUE.get( PLDYNID );
  if ( serverQueue == null ) {
    return await int.reply( 'Nothing is playing at the moment.' );
  }

  let member: GuildMember;

  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch ( noMember ) {
    throw new Error( 'Couldnt locate the calling member!' );
  }

  try {
    if ( member.voice?.channel == null ) {
      return await int.reply( 'Youre not connected to a voice channel!' );
    }
    else if ( member.voice.channel !== serverQueue.voiceChannel ) {
      return await int.reply( 'You need to call this from the player channel!' );
    }

    await PlayerUtils.handleSongEnd( LCARS47.MEDIA_QUEUE, serverQueue );

    return await int.reply( {
      content: 'Queue skipped forward.'
    } );
  }
  catch ( endErr: any ) {
    throw new Error( `Failed to terminate player.\n${endErr}` );
  }
}

function help (): string {
  return 'Moves media player on to the next song in the queue (if any).';
}

// Exports
export default {
  name: 'Skip',
  data,
  execute,
  help
};
