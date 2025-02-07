// -- QUEUE --
// Displays the list of songs currently playing

// Imports
import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import { type ChatInputCommandInteraction, type CommandInteraction, type InteractionResponse } from 'discord.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { convertSecondsToHMS } from '../../Subsystems/Utilities/MediaUtils.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';

let PLDYNID: string;

if ( process.env.PLDYNID == null ) {
  Utility.log( 'error', '[MEDIA-PLAYER] PLDYNID not set.' );
  throw new Error( 'PLDYNID not set.' );
}
else {
  PLDYNID = process.env.PLDYNID;
}

// Globals
const data = new SlashCommandBuilder()
  .setName( 'queue' )
  .setDescription( 'Displays a list of the songs in the playlist.' );

// Functions
async function execute ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<InteractionResponse> {
  Utility.log( 'info', '[MEDIA-PLAYER] Received a queue request.' );

  let member;
  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch {
    return await int.reply( {
      content: 'No data could be found on your user. Process terminated.',
      ephemeral: true
    } );
  }

  try {
    if ( member.voice?.channel == null ) {
      return await int.reply( {
        content: 'User must be attached to a valid voice channel.',
        ephemeral: true
      } );
    }
    else {
      return await displayQueue( LCARS47, int );
    }
  }
  catch {
    return await int.reply( {
      content: 'Error retrieving valid voice channel. Process terminated.',
      ephemeral: true
    } );
  }
}

async function displayQueue ( LCARS47: LCARSClient, int: CommandInteraction ): Promise<InteractionResponse> {
  let queueList;
  let songList = '';
  let totalDuration = 0;

  if ( LCARS47.MEDIA_QUEUE.has( PLDYNID ) ) {
    queueList = LCARS47.MEDIA_QUEUE.get( PLDYNID )?.songs;

    if ( queueList == null ) return await int.reply( { content: 'No media in queue.' } );
  }
  else {
    return await int.reply( {
      content: 'No media in queue.'
    } );
  }

  // `__[${songDetail.title}](<${songDetail.url}>)__\n`

  for ( const song of queueList ) {
    songList += `**[${song.title}](${song.url})** - *${song.info.videoDetails.author.name}* (${song.durationFriendly})\n`;
    totalDuration += song.duration;
  }

  return await int.reply( {
    content: `**__Player Queue__** (${convertSecondsToHMS( totalDuration )})\n${songList}`
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
