// -- QUEUE --
// Displays the list of songs currently playing

// Imports
import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type CommandInteraction,
  type InteractionResponse,
  MessageFlags
} from 'discord.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { convertSecondsToHMS } from '../../Subsystems/Utilities/MediaUtils.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import { getEnv } from '../../Subsystems/Utilities/EnvUtils.js';

const env = getEnv();
const PLDYNID = env.PLDYNID;

// Globals
const data = new SlashCommandBuilder()
  .setName( 'queue' )
  .setDescription( 'Displays a list of the songs in the playlist.' );

// Functions
async function execute ( LCARS47: LCARSClient, int: ChatInputCommandInteraction | AutocompleteInteraction ): Promise<InteractionResponse | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    {
      name: 'This command does not support autocomplete.',
      value: 'none'
    }
  ]);

  Utility.log( 'info', '[MEDIA-PLAYER] Received a queue request.' );

  let member;
  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch {
    return await int.reply( {
      content: 'No data could be found on your user. Process terminated.',
      flags: MessageFlags.Ephemeral
    } );
  }

  try {
    if ( member.voice?.channel == null ) {
      return await int.reply( {
        content: 'User must be attached to a valid voice channel.',
        flags: MessageFlags.Ephemeral
      } );
    }
    else {
      return await displayQueue( LCARS47, int );
    }
  }
  catch {
    return await int.reply( {
      content: 'Error retrieving valid voice channel. Process terminated.',
      flags: MessageFlags.Ephemeral
    } );
  }
}

async function displayQueue ( LCARS47: LCARSClient, int: CommandInteraction ): Promise<InteractionResponse> {
  let queueList;
  let songList = '';
  let totalDuration = 0;

  if ( LCARS47.MEDIA_QUEUE.has( PLDYNID ) ) {
    queueList = LCARS47.MEDIA_QUEUE.get( PLDYNID )?.songs;

    if ( queueList == null ) return await int.reply( { content: 'No media in queue.', flags: MessageFlags.SuppressEmbeds } );
  }
  else {
    return await int.reply( {
      content: 'No media in queue.'
    } );
  }

  // `__[${songDetail.title}](<${songDetail.url}>)__\n`

  for ( const song of queueList ) {
    const channelName = song.info.channel ? song.info.channel.name : 'Unknown Channel';

    songList += `**[${song.title}](${song.url})** - *${ channelName }* (${song.durationFriendly})\n`;
    totalDuration += song.duration;
  }

  return await int.reply( {
    content: `**__Player Queue__** (${convertSecondsToHMS( totalDuration )})\n${songList}`,
    flags: MessageFlags.SuppressEmbeds
  } );
}

function help (): string {
  return 'Displays the list of songs in the playlist.';
}

// Exports
export default {
  name: 'Status',
  data,
  execute,
  help
} satisfies Command;
