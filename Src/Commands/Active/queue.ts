// -- QUEUE --
// Displays the list of tracks currently queued.

import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type InteractionResponse,
  MessageFlags
} from 'discord.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { convertSecondsToHMS } from '../../Subsystems/Utilities/MediaUtils.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import { queueLine } from '../../Subsystems/MediaPlayer/TrackFormat.js';

const data = new SlashCommandBuilder()
  .setName( 'queue' )
  .setDescription( 'Displays a list of the songs in the playlist.' );

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  Utility.log( 'info', '[MEDIA-PLAYER] Received a queue request.' );

  let member: GuildMember;
  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch {
    return await int.reply( {
      content: 'No data could be found on your user. Process terminated.',
      flags: MessageFlags.Ephemeral
    } );
  }

  if ( member.voice?.channel == null ) {
    return await int.reply( {
      content: 'User must be attached to a valid voice channel.',
      flags: MessageFlags.Ephemeral
    } );
  }

  const tracks = LCARS47.MEDIA_PLAYER.getQueue();
  if ( tracks.length === 0 ) {
    return await int.reply( { content: 'No media in queue.' } );
  }

  let songList = '';
  let totalDuration = 0;
  for ( const track of tracks ) {
    songList += `${ queueLine( track ) }\n`;
    totalDuration += track.duration;
  }

  return await int.reply( {
    content: `**__Player Queue__** (${ convertSecondsToHMS( totalDuration ) })\n${ songList }`,
    flags: MessageFlags.SuppressEmbeds
  } );
}

function help (): string {
  return 'Displays the list of songs in the playlist.';
}

export default {
  name: 'Status',
  data,
  execute,
  help
} satisfies Command;
