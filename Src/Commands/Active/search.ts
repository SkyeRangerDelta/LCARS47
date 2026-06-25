// -- SEARCH --
// Interactive song selector. Searches Jellyfin (falling back to YouTube when
// the library has nothing) and lists up to 5 candidates — individual tracks
// AND whole albums / playlists — each with a numbered button so the user can
// queue a result directly. Picking a track queues that track; picking an
// album/playlist expands it and queues every track. This closes the gap where
// /jellyfin-search forced you to re-type a title into /play.
//
// Selection state can't ride inside a button customId (a Track is too big), so
// results are stashed in a short-lived module cache keyed by the interaction
// id; the button handler looks them up by that token, then resolves the chosen
// entry into queueable tracks (expanding containers on demand).

import {
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type InteractionResponse,
  type VoiceChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { type Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import { convertSecondsToHMS } from '../../Subsystems/Utilities/MediaUtils.js';
import { sourceLabel } from '../../Subsystems/MediaPlayer/TrackFormat.js';
import { type Track } from '../../Subsystems/MediaPlayer/Interfaces/Track.js';
import { JellyfinProvider } from '../../Subsystems/MediaPlayer/Providers/JellyfinProvider.js';
import { YouTubeProvider } from '../../Subsystems/MediaPlayer/Providers/YouTubeProvider.js';
import { type JellyfinItemKind } from '../../Subsystems/Jellyfin/Interfaces/JellyfinItem.js';

const MAX_RESULTS = 5;           // Discord allows 5 buttons per action row.
const JELLYFIN_SEARCH_LIMIT = 25; // Over-fetch so type filtering still yields hits.
const CACHE_TTL_MS = 5 * 60 * 1000;

type FilterType = 'track' | 'album' | 'playlist';

// A selectable result. `resolve` turns it into the track(s) to queue when the
// user clicks — for tracks that's the track itself; for containers it expands
// the album/playlist (a network call) at click time.
interface SearchEntry {
  label: string;
  resolve: ( requestedBy: GuildMember ) => Promise<Track[]>;
}

interface CachedSearch {
  entries: SearchEntry[];
  expiresAt: number;
}

// token (interaction id) -> results. Lazily purged on each new search.
const resultCache = new Map<string, CachedSearch>();

const data = new SlashCommandBuilder()
  .setName( 'search' )
  .setDescription( 'Search for music and pick a result to queue.' );

data.addStringOption( o => o
  .setName( 'query' )
  .setDescription( 'Title / artist / album to look up.' )
  .setRequired( true )
);
data.addStringOption( o => o
  .setName( 'type' )
  .setDescription( 'Limit results to a kind (default: everything).' )
  .setRequired( false )
  .addChoices(
    { name: 'Track', value: 'track' },
    { name: 'Album', value: 'album' },
    { name: 'Playlist', value: 'playlist' }
  )
);
data.addStringOption( o => o
  .setName( 'source' )
  .setDescription( 'Force a source (default: Jellyfin, then YouTube).' )
  .setRequired( false )
  .addChoices(
    { name: 'Jellyfin', value: 'jellyfin' },
    { name: 'YouTube', value: 'youtube' }
  )
);
data.addStringOption( o => o
  .setName( 'artist' )
  .setDescription( 'Narrow results by artist.' )
  .setRequired( false )
);
data.addStringOption( o => o
  .setName( 'album' )
  .setDescription( 'Narrow results by album.' )
  .setRequired( false )
);

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  purgeExpired();

  const type = int.options.getString( 'type' ) as FilterType | null;
  const source = int.options.getString( 'source' ) as 'jellyfin' | 'youtube' | null;
  const query = int.options.getString( 'query' ) ?? '';
  const artist = int.options.getString( 'artist' ) ?? '';
  const album = int.options.getString( 'album' ) ?? '';

  await int.deferReply();

  // Filters are extra search tokens — Jellyfin matches token-AND across
  // title/artist/album, and YouTube benefits from the added context too.
  const composedQuery = [query, artist, album].filter( s => s.trim() !== '' ).join( ' ' );

  let entries: SearchEntry[] = [];
  let usedSource: 'jellyfin' | 'youtube' | null = null;

  // Jellyfin first (unless YouTube was forced).
  if ( source !== 'youtube' ) {
    const jellyfin = LCARS47.MEDIA_PLAYER.getProvider( 'jellyfin' );
    if ( jellyfin instanceof JellyfinProvider && jellyfin.isEnabled() ) {
      try {
        entries = await searchJellyfin( jellyfin, composedQuery, type, LCARS47.MEMBER );
        if ( entries.length > 0 ) usedSource = 'jellyfin';
      }
      catch ( err ) {
        Utility.log( 'warn', `[SEARCH] Jellyfin search failed: ${ String( err ) }` );
      }
    }
  }

  // YouTube when forced, or as a fallback when Jellyfin had nothing.
  if ( entries.length === 0 && source !== 'jellyfin' ) {
    const youtube = LCARS47.MEDIA_PLAYER.getProvider( 'youtube' );
    if ( youtube instanceof YouTubeProvider && youtube.isEnabled() ) {
      try {
        entries = await searchYouTube( youtube, composedQuery, LCARS47.MEMBER );
        if ( entries.length > 0 ) usedSource = 'youtube';
      }
      catch ( err ) {
        Utility.log( 'warn', `[SEARCH] YouTube search failed: ${ String( err ) }` );
      }
    }
  }

  if ( entries.length === 0 ) {
    await int.editReply( 'No results found.' );
    return;
  }

  // A single, unambiguous hit needs no menu — queue it straight away, provided
  // the user is in a voice channel. If they aren't, fall through to the button
  // so they can join and then click.
  if ( entries.length === 1 ) {
    const member = await fetchMember( LCARS47, int.user.id );
    const voiceChannel = member?.voice?.channel ?? null;
    if ( member != null && voiceChannel != null ) {
      await queueEntry( LCARS47, int, entries[0], member, voiceChannel as VoiceChannel );
      return;
    }
  }

  const token = int.id;
  resultCache.set( token, { entries, expiresAt: Date.now() + CACHE_TTL_MS } );

  const lines = entries.map( ( e, i ) => `**${ i + 1 }.** ${ e.label }` );
  const header = `**__Search Results (${ sourceLabel( usedSource ?? 'jellyfin' ) })__**`;
  await int.editReply( {
    content: `${ header }\n${ lines.join( '\n' ) }`,
    components: buildButtons( token, entries.length )
  } );
}

/** Build Jellyfin selectable entries — tracks and containers mixed. Over-fetch
 *  then optionally filter to the requested type, so an album-only filter still
 *  finds the album even if its track hits dominate the raw result order. */
async function searchJellyfin(
  provider: JellyfinProvider,
  query: string,
  type: FilterType | null,
  searcher: GuildMember
): Promise<SearchEntry[]> {
  const items = await provider.searchSelectable( query, { limit: JELLYFIN_SEARCH_LIMIT } );
  const filtered = type == null ? items : items.filter( i => matchesType( i.kind, type ) );

  return filtered.slice( 0, MAX_RESULTS ).map( item => {
    if ( item.kind === 'audio' ) {
      const track = provider.toTrack( item, searcher );
      return {
        label: `**${ track.title }** — *${ track.channelOrAlbumLabel }* (${ convertSecondsToHMS( track.duration ) })`,
        resolve: () => Promise.resolve( [track] )
      };
    }
    const containerKind = item.kind === 'album' ? 'album' : 'playlist';
    const icon = containerKind === 'album' ? '💿' : '🎵';
    const artistSuffix = item.artist != null && item.artist !== '' ? ` — *${ item.artist }*` : '';
    return {
      label: `${ icon } **${ item.name }**${ artistSuffix } (${ containerKind })`,
      resolve: ( rb: GuildMember ) => provider.resolveContainerTracks( item.id, containerKind, rb )
    };
  } );
}

/** Build YouTube selectable entries (tracks only). */
async function searchYouTube(
  provider: YouTubeProvider,
  query: string,
  searcher: GuildMember
): Promise<SearchEntry[]> {
  const tracks = await provider.searchMany( query, { requestedBy: searcher, limit: MAX_RESULTS } );
  return tracks.map( track => ( {
    label: `**${ track.title }** — *${ track.channelOrAlbumLabel }* (${ convertSecondsToHMS( track.duration ) })`,
    resolve: () => Promise.resolve( [track] )
  } ) );
}

function matchesType( kind: JellyfinItemKind, type: FilterType ): boolean {
  if ( type === 'track' ) return kind === 'audio';
  return kind === type; // 'album' | 'playlist'
}

/** Numbered pick buttons (one per result, max 5) on the first row, and a
 *  Cancel button on its own row so it never competes for the 5-button slot
 *  limit. Cancel lets the user bail out when no result fits. */
function buildButtons( token: string, count: number ): ActionRowBuilder<ButtonBuilder>[] {
  const pickRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    Array.from( { length: count }, ( _v, i ) => new ButtonBuilder()
      .setCustomId( `search_pick_${ token }_${ i }` )
      .setLabel( String( i + 1 ) )
      .setStyle( ButtonStyle.Secondary )
    )
  );
  const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId( `search_cancel_${ token }` )
      .setLabel( 'Cancel' )
      .setStyle( ButtonStyle.Danger )
      .setEmoji( '✖️' )
  );
  return [pickRow, cancelRow];
}

async function handleButton (
  LCARS47: LCARSClient,
  int: ButtonInteraction
): Promise<void> {
  const parts = int.customId.split( '_' );
  const action = parts[1]; // 'pick' | 'cancel'
  const token = parts[2];
  const index = Number( parts[3] );

  // Cancel always works — clear the cache and strip the menu off the message.
  if ( action === 'cancel' ) {
    resultCache.delete( token );
    await int.update( { content: 'Search cancelled.', components: [] } );
    return;
  }

  const cached = resultCache.get( token );
  if ( cached == null || cached.expiresAt < Date.now() ) {
    resultCache.delete( token );
    await int.reply( {
      content: 'This search has expired — run `/search` again.',
      flags: MessageFlags.Ephemeral
    } );
    return;
  }

  const entry = cached.entries[index];
  if ( entry == null ) {
    await int.reply( { content: 'That selection is no longer available.', flags: MessageFlags.Ephemeral } );
    return;
  }

  // The clicker (not necessarily the original searcher) must be in a voice
  // channel; they become the requester of whatever they queue.
  const member = await fetchMember( LCARS47, int.user.id );
  if ( member == null ) {
    await int.reply( { content: 'No data could be found on your user.', flags: MessageFlags.Ephemeral } );
    return;
  }
  if ( member.voice?.channel == null ) {
    await int.reply( { content: 'You need to be in a voice channel first!', flags: MessageFlags.Ephemeral } );
    return;
  }

  await queueEntry( LCARS47, int, entry, member, member.voice.channel as VoiceChannel );
}

/** Resolve a selected entry into tracks and queue them, replying with the
 *  result. Shared by single-result auto-queue and button selection — both have
 *  already deferred (or will), so this defers if needed and edits the reply.
 *  Container entries expand over the network, hence the defer. */
async function queueEntry(
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | ButtonInteraction,
  entry: SearchEntry,
  member: GuildMember,
  voiceChannel: VoiceChannel
): Promise<void> {
  if ( !int.deferred && !int.replied ) await int.deferReply();

  let tracks: Track[];
  try {
    tracks = await entry.resolve( member );
  }
  catch ( err ) {
    Utility.log( 'warn', `[SEARCH] Resolve failed: ${ String( err ) }` );
    await int.editReply( 'Could not load that selection.' );
    return;
  }

  if ( tracks.length === 0 ) {
    await int.editReply( 'That selection had no playable tracks.' );
    return;
  }

  const result = LCARS47.MEDIA_PLAYER.enqueueResolved( tracks, voiceChannel, member );
  if ( !result.ok ) {
    await int.editReply( 'Could not queue that selection.' );
    return;
  }

  const reply = result.queuedCount > 1
    ? `Queued **${ result.track.title }** + ${ result.queuedCount - 1 } more (${ sourceLabel( result.track.source ) })`
    : `Queued **${ result.track.title }** (${ sourceLabel( result.track.source ) })`;
  await int.editReply( `${ member.displayName } — ${ reply }` );
}

/** Fetch a guild member by user id, or null if the lookup fails. */
async function fetchMember( LCARS47: LCARSClient, userId: string ): Promise<GuildMember | null> {
  try {
    return await LCARS47.PLDYN.members.fetch( userId );
  }
  catch {
    return null;
  }
}

/** Drop expired cache entries so the map doesn't grow unbounded. */
function purgeExpired(): void {
  const now = Date.now();
  for ( const [token, entry] of resultCache ) {
    if ( entry.expiresAt < now ) resultCache.delete( token );
  }
}

function help (): string {
  return 'Search Jellyfin (then YouTube) and pick a track, album, or playlist to queue. Filter by type, source, artist, or album.';
}

export default {
  name: 'Search',
  data,
  execute,
  handleButton,
  help
} satisfies Command;
