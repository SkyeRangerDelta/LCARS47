// -- QUEUE --
// Displays the list of tracks currently queued.
//
// Default behaviour truncates so the reply fits inside Discord's 2000-char
// limit and adds an "…and N more" footer. `/queue full:true` paginates the
// full list across multiple follow-up messages.

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
import { type Track } from '../../Subsystems/MediaPlayer/Interfaces/Track.js';

const DISCORD_MSG_LIMIT = 2000;
// Leave a little headroom so the trailing "...and N more" footer always fits,
// and so total-duration header on subsequent pages doesn't push us over.
const CHUNK_BUDGET = 1900;

const data = new SlashCommandBuilder()
  .setName( 'queue' )
  .setDescription( 'Displays a list of the songs in the playlist.' );

data.addBooleanOption( o => o
  .setName( 'full' )
  .setDescription( 'Show every track, paginated across multiple messages.' )
  .setRequired( false )
);

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

  const totalDuration = tracks.reduce( ( sum, t ) => sum + t.duration, 0 );
  const header = `**__Player Queue__** (${ convertSecondsToHMS( totalDuration ) })`;
  const full = int.options.getBoolean( 'full' ) === true;

  if ( full ) {
    await sendPaginatedQueue( int, header, tracks );
    return;
  }

  return await int.reply( {
    content: buildTruncatedQueue( header, tracks ),
    flags: MessageFlags.SuppressEmbeds
  } );
}

function buildTruncatedQueue( header: string, tracks: Track[] ): string {
  // Greedy fill: keep adding lines while the resulting message still has
  // room for the worst-case footer ("…and N more" — reserve 40 chars).
  const footerReserve = 40;
  let body = '';
  let shown = 0;
  for ( const track of tracks ) {
    const line = `${ queueLine( track ) }\n`;
    const projected = header.length + 1 + body.length + line.length;
    if ( projected + footerReserve > DISCORD_MSG_LIMIT ) break;
    body += line;
    shown += 1;
  }

  if ( shown === tracks.length ) {
    return `${ header }\n${ body }`.trimEnd();
  }
  const remaining = tracks.length - shown;
  return `${ header }\n${ body }*…and ${ remaining } more — run \`/queue full:true\` to see all.*`;
}

async function sendPaginatedQueue (
  int: ChatInputCommandInteraction,
  header: string,
  tracks: Track[]
): Promise<void> {
  // Pre-build all chunks so we know the page count for the header.
  const chunks: string[] = [];
  let current = '';
  for ( const track of tracks ) {
    const line = `${ queueLine( track ) }\n`;
    if ( current.length + line.length > CHUNK_BUDGET ) {
      chunks.push( current.trimEnd() );
      current = '';
    }
    current += line;
  }
  if ( current.length > 0 ) chunks.push( current.trimEnd() );

  await int.deferReply();
  for ( let i = 0; i < chunks.length; i += 1 ) {
    const pageHeader = `${ header } — page ${ i + 1 }/${ chunks.length }`;
    const content = `${ pageHeader }\n${ chunks[i] }`;
    if ( i === 0 ) {
      await int.editReply( { content } );
    }
    else {
      await int.followUp( { content, flags: MessageFlags.SuppressEmbeds } );
    }
  }
}

function help (): string {
  return 'Displays the list of songs in the playlist. Pass full:true to paginate the entire list.';
}

export default {
  name: 'Status',
  data,
  execute,
  help
} satisfies Command;
