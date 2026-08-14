// -- SKIP --
// Advances the media player to the next queued track.

import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type InteractionResponse
} from 'discord.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';

const data = new SlashCommandBuilder()
  .setName( 'skip' )
  .setDescription( 'Moves the music player on to the next song in queue (if any).' );

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  Utility.log( 'info', '[MEDIA-PLAYER] Received a skip command.' );

  if ( !LCARS47.MEDIA_PLAYER.isActive() ) {
    return await int.reply( 'Nothing is playing at the moment.' );
  }

  let member: GuildMember;
  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch {
    throw new Error( 'Couldnt locate the calling member!' );
  }

  const boundChannel = LCARS47.MEDIA_PLAYER.getBoundVoiceChannel();
  if ( member.voice?.channel == null ) {
    return await int.reply( 'Youre not connected to a voice channel!' );
  }
  if ( boundChannel != null && member.voice.channel.id !== boundChannel.id ) {
    return await int.reply( 'You need to call this from the player channel!' );
  }

  await LCARS47.MEDIA_PLAYER.skip();
  return await int.reply( { content: 'Queue skipped forward.' } );
}

function help (): string {
  return 'Moves media player on to the next song in the queue (if any).';
}

export default {
  name: 'Skip',
  data,
  execute,
  help
} satisfies Command;
