// -- STOP --
// Halts and disconnects the media player

// Imports
import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import {
  type ChatInputCommandInteraction,
  type GuildMember,
  type InteractionResponse
} from 'discord.js';

import { getVoiceConnection } from '@discordjs/voice';
const PLDYNID = process.env.PLDYNID ?? '';

// Functions
const data = new SlashCommandBuilder()
  .setName( 'stop' )
  .setDescription( 'Halts and disconnects the media player.' );

async function execute ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<InteractionResponse> {
  Utility.log( 'info', '[MEDIA-PLAYER] Received a stop command.' );

  const serverQueue = LCARS47.MEDIA_QUEUE.get( PLDYNID );
  if ( serverQueue == null ) {
    return await int.reply( 'Nothing is playing at the moment.' );
  }

  let member: GuildMember;

  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch ( noMember ) {
    throw new Error( 'Couldnt the calling member!' );
  }

  try {
    if ( member.voice?.channel == null ) {
      return await int.reply( 'Youre not connected to a voice channel!' );
    }
    else if ( member.voice.channel !== serverQueue.voiceChannel ) {
      return await int.reply( 'You need to call this from the player channel!' );
    }

    const connection = getVoiceConnection( PLDYNID );
    connection?.destroy();
    LCARS47.MEDIA_QUEUE.delete( PLDYNID );
    return await int.reply( 'Disconnected!' );
  }
  catch ( endErr: any ) {
    throw new Error( `Failed to terminate player.\n${endErr}` );
  }
}

function help (): string {
  return 'Halts and disconnects the media player.';
}

// Exports
export default {
  name: 'Stop',
  data,
  execute,
  help
};
