// -- JELLYFIN-SEARCH --
// Searches Jellyfin only (no enqueue, no YouTube). Used to verify what the
// library exposes and to disambiguate when /play picks the wrong source.

import { SlashCommandBuilder } from '@discordjs/builders';
import {
  type AutocompleteInteraction,
  type CacheType,
  type ChatInputCommandInteraction,
  type GuildCacheMessage,
  type InteractionResponse,
  MessageFlags
} from 'discord.js';

import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import { convertSecondsToHMS } from '../../Subsystems/Utilities/MediaUtils.js';

const data = new SlashCommandBuilder()
  .setName( 'jellyfin-search' )
  .setDescription( 'Search the Jellyfin library (no playback).' );

data.addStringOption( o => o
  .setName( 'query' )
  .setDescription( 'Title / artist / album to look up.' )
  .setRequired( true )
);

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse | GuildCacheMessage<CacheType> | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  const provider = LCARS47.MEDIA_PLAYER.getProvider( 'jellyfin' );
  if ( provider == null || !provider.isEnabled() ) {
    return await int.reply( {
      content: 'Jellyfin is not configured or not currently reachable.',
      flags: MessageFlags.Ephemeral
    } );
  }

  await int.deferReply();
  const query = int.options.getString( 'query' ) ?? '';

  let result;
  try {
    result = await provider.search( query, {
      requestedBy: LCARS47.MEMBER,
      limit: 10,
      // Discovery tool — show what's in the library, including albums and
      // playlists. Users can then /play album:true <album name> to queue.
      expandContainers: true
    } );
  }
  catch ( err ) {
    Utility.log( 'warn', `[JELLYFIN-SEARCH] ${ String( err ) }` );
    return await int.editReply( `Search failed: ${ String( err ) }` );
  }

  if ( result.tracks.length === 0 ) {
    return await int.editReply( 'No Jellyfin hits.' );
  }

  const lines = result.tracks
    .slice( 0, 10 )
    .map( t => `**${ t.title }** — *${ t.channelOrAlbumLabel }* (${ convertSecondsToHMS( t.duration ) })` )
    .join( '\n' );

  return await int.editReply( {
    content: `**__Jellyfin Search Results__**\n${ lines }`
  } );
}

function help (): string {
  return 'Searches the Jellyfin library without enqueueing anything.';
}

export default {
  name: 'JellyfinSearch',
  data,
  execute,
  help
} satisfies Command;
