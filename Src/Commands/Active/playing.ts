// -- PLAYING --
// Displays details about the currently-playing track.

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
import { type Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import { convertSecondsToHMS } from '../../Subsystems/Utilities/MediaUtils';
import { sourceAndDuration } from '../../Subsystems/MediaPlayer/TrackFormat.js';

const data = new SlashCommandBuilder()
  .setName( 'playing' )
  .setDescription( 'Displays details about the currently playing song.' );

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  Utility.log( 'info', '[MEDIA-PLAYER] Received a song detail request.' );

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

  const track = LCARS47.MEDIA_PLAYER.getNowPlaying();
  if ( track == null ) {
    return await int.reply( { content: 'No media in queue.' } );
  }

  const currentPlaytime = Math.floor( ( Date.now() - track.playStart ) / 1000 );
  const titleLine = track.source === 'youtube'
    ? `__[${ track.title }](<${ track.url }>)__ ${ sourceAndDuration( track ) }`
    : `__${ track.title }__ ${ sourceAndDuration( track ) }`;

  return await int.reply( {
    content:
      `${ titleLine }\n` +
      `From: *${ track.channelOrAlbumLabel }*\n` +
      `Playtime: ${ convertSecondsToHMS( currentPlaytime ) } / ${ track.durationFriendly }\n` +
      `Queued by: ${ track.requestedBy.displayName }`
  } );
}

function help (): string {
  return 'Displays details about the currently playing song.';
}

export default {
  name: 'Playing',
  data,
  execute,
  help
} satisfies Command;
