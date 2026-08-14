// -- STOP --
// Halts and disconnects the media player.

import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type InteractionResponse
} from 'discord.js';
const data = new SlashCommandBuilder()
  .setName( 'stop' )
  .setDescription( 'Halts and disconnects the media player.' );

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  Utility.log( 'info', '[MEDIA-PLAYER] Received a stop command.' );

  if ( !LCARS47.MEDIA_PLAYER.isActive() ) {
    return await int.reply( 'Nothing is playing at the moment.' );
  }

  let member: GuildMember;
  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch {
    throw new Error( 'Couldnt the calling member!' );
  }

  const boundChannel = LCARS47.MEDIA_PLAYER.getBoundVoiceChannel();
  if ( member.voice?.channel == null ) {
    return await int.reply( 'Youre not connected to a voice channel!' );
  }
  if ( boundChannel != null && member.voice.channel.id !== boundChannel.id ) {
    return await int.reply( 'You need to call this from the player channel!' );
  }

  const stopped = LCARS47.MEDIA_PLAYER.stop();
  return await int.reply( stopped ? 'Disconnected!' : 'Nothing to stop.' );
}

function help (): string {
  return 'Halts and disconnects the media player.';
}

export default {
  name: 'Stop',
  data,
  execute,
  help
};
