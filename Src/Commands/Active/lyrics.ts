// -- LYRICS --
// Displays lyrics for the currently-playing track. Sources lyrics from the
// Jellyfin library first (when the track is a Jellyfin item with an .lrc /
// embedded lyric), and falls back to lrclib.net for everything else (YouTube
// tracks, or library tracks with no stored lyrics). Renders as static text,
// paginated across follow-up messages to respect Discord's 2000-char limit.

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
import { JellyfinProvider } from '../../Subsystems/MediaPlayer/Providers/JellyfinProvider.js';
import LrcLibClient from '../../Subsystems/Lyrics/LrcLibClient.js';
import { type LyricsResult } from '../../Subsystems/Jellyfin/Interfaces/LyricLine.js';
import { type Track } from '../../Subsystems/MediaPlayer/Interfaces/Track.js';

// Leave headroom under Discord's 2000-char limit for the page header.
const CHUNK_BUDGET = 1900;

const data = new SlashCommandBuilder()
  .setName( 'lyrics' )
  .setDescription( 'Shows the lyrics for the currently playing song.' );

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  Utility.log( 'info', '[MEDIA-PLAYER] Received a lyrics request.' );

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

  await int.deferReply();

  const { lyrics, source } = await resolveLyrics( LCARS47, track );
  if ( lyrics == null || lyrics.lines.length === 0 ) {
    await int.editReply( `No lyrics could be located for __${ track.title }__.` );
    return;
  }

  const artist = track.albumArtist ?? track.channelOrAlbumLabel;
  const header = `**__Lyrics — ${ track.title }__**\n*${ artist }* · (via ${ source })`;
  await sendPaginatedLyrics( int, header, lyrics );
}

/** Try Jellyfin first for library tracks, then lrclib.net for anything that
 *  has no library lyrics (or isn't a Jellyfin track to begin with). */
async function resolveLyrics(
  LCARS47: LCARSClient,
  track: Track
): Promise<{ lyrics: LyricsResult | null; source: string }> {
  if ( track.source === 'jellyfin' ) {
    const provider = LCARS47.MEDIA_PLAYER.getProvider( 'jellyfin' );
    if ( provider instanceof JellyfinProvider ) {
      const jellyfinLyrics = await provider.getLyrics( track );
      if ( jellyfinLyrics != null ) return { lyrics: jellyfinLyrics, source: 'Jellyfin' };
    }
  }

  const fallback = await LrcLibClient.getLyrics( buildLyricsQuery( track ) );
  return { lyrics: fallback, source: 'lrclib.net' };
}

/** Derive a clean { track, artist, album } query for lrclib from a Track.
 *  The two sources encode metadata differently:
 *    - Jellyfin: channelOrAlbumLabel is "Artist — Album"; title is the song.
 *    - YouTube: title is usually "Artist - Song (Official Video)" and the
 *      label is just the channel name, which is a poor artist key — so we
 *      parse the artist out of the title instead and drop the channel. */
function buildLyricsQuery( track: Track ): { trackName: string; artistName?: string; albumName?: string } {
  if ( track.source === 'jellyfin' ) {
    const [artist, album] = track.channelOrAlbumLabel.split( ' — ' );
    return {
      trackName: track.title,
      artistName: track.albumArtist ?? artist?.trim(),
      albumName: album?.trim()
    };
  }

  // YouTube / other: strip "(Official Video)", "[Lyrics]", etc., then split
  // an "Artist - Song" title on the first dash.
  const cleaned = track.title
    .replace( /\s*[([][^)\]]*[)\]]\s*/g, ' ' )
    .replace( /\s+/g, ' ' )
    .trim();
  const parts = cleaned.split( /\s+[-–—]\s+/ );
  if ( parts.length >= 2 ) {
    return { artistName: parts[0].trim(), trackName: parts.slice( 1 ).join( ' - ' ).trim() };
  }
  // No parseable artist — search by the cleaned title alone.
  return { trackName: cleaned };
}

/** Render the lyric body, split into pages that each stay under Discord's
 *  message limit. Page 1 edits the deferred reply; the rest are follow-ups. */
async function sendPaginatedLyrics (
  int: ChatInputCommandInteraction,
  header: string,
  lyrics: LyricsResult
): Promise<void> {
  const body = lyrics.lines.map( l => l.text ).join( '\n' );

  const chunks: string[] = [];
  let current = '';
  for ( const line of body.split( '\n' ) ) {
    const next = `${ line }\n`;
    if ( current.length + next.length > CHUNK_BUDGET ) {
      chunks.push( current.trimEnd() );
      current = '';
    }
    current += next;
  }
  if ( current.trim().length > 0 ) chunks.push( current.trimEnd() );
  if ( chunks.length === 0 ) chunks.push( '(no lyric text)' );

  for ( let i = 0; i < chunks.length; i += 1 ) {
    const pageHeader = chunks.length > 1
      ? `${ header } — page ${ i + 1 }/${ chunks.length }`
      : header;
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
  return 'Displays the lyrics for the currently playing song (Jellyfin library, with an lrclib.net fallback).';
}

export default {
  name: 'Lyrics',
  data,
  execute,
  help
} satisfies Command;
