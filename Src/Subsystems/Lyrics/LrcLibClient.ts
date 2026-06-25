// -- LrcLibClient --
// Free, no-auth lyrics fallback (https://lrclib.net) used when Jellyfin has
// no lyrics for a track — or when the now-playing track isn't a Jellyfin item
// at all (e.g. YouTube). Returns the same LyricsResult DTO the JellyfinClient
// produces so the /lyrics command renders either source uniformly.

import Utility from '../Utilities/SysUtils.js';
import { type LyricsResult } from '../Jellyfin/Interfaces/LyricLine.js';

const API_BASE = 'https://lrclib.net/api';
// lrclib's /get endpoint alone routinely takes ~3.5s and /search is slower;
// the command has already deferred its reply, so allow generous headroom.
const FETCH_TIMEOUT_MS = 10000;
const USER_AGENT = 'LCARS47 (https://pldyn.net)';

interface LrcLibRecord {
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  instrumental?: boolean;
}

export interface LrcLibQuery {
  trackName: string;
  artistName?: string;
  albumName?: string;
}

/** Strip `[mm:ss.xx]` timestamp tags from a synced (.lrc) lyric block,
 *  leaving plain text lines. */
function stripSyncedTags( synced: string ): string {
  return synced
    .split( /\r?\n/ )
    .map( line => line.replace( /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, '' ).trim() )
    .join( '\n' )
    .trim();
}

/** Map a raw lrclib record into a LyricsResult, preferring plain lyrics and
 *  falling back to a de-timed synced block. Returns null for instrumentals
 *  or records with no usable text. */
function recordToResult( record: LrcLibRecord | null | undefined ): LyricsResult | null {
  if ( record == null || record.instrumental === true ) return null;

  let text = record.plainLyrics ?? '';
  if ( text.trim() === '' && record.syncedLyrics != null ) {
    text = stripSyncedTags( record.syncedLyrics );
  }
  if ( text.trim() === '' ) return null;

  return {
    synced: false,
    lines: text.split( /\r?\n/ ).map( line => ( { text: line } ) )
  };
}

async function fetchJson( url: string ): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout( () => controller.abort(), FETCH_TIMEOUT_MS );
  try {
    const res = await fetch( url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT }
    } );
    if ( !res.ok ) return null;
    return await res.json();
  }
  catch ( err ) {
    Utility.log( 'warn', `[LRCLIB] Fetch failed: ${ String( err ) }` );
    return null;
  }
  finally {
    clearTimeout( timer );
  }
}

/** Look up lyrics for a track. Tries the exact /get endpoint first (best
 *  precision), then falls back to /search and takes the top hit. Returns null
 *  when nothing usable is found. */
export async function getLyrics( query: LrcLibQuery ): Promise<LyricsResult | null> {
  const { trackName, artistName, albumName } = query;
  if ( trackName.trim() === '' ) return null;

  // Exact match: requires at least a track + artist to be meaningful.
  if ( artistName != null && artistName.trim() !== '' ) {
    const params = new URLSearchParams( {
      track_name: trackName,
      artist_name: artistName
    } );
    if ( albumName != null && albumName.trim() !== '' ) params.set( 'album_name', albumName );

    const exact = await fetchJson( `${ API_BASE }/get?${ params.toString() }` );
    const result = recordToResult( exact as LrcLibRecord );
    if ( result != null ) return result;
  }

  // Fuzzy fallback: search and take the first record that yields lyrics.
  const searchTerms = [trackName, artistName].filter( ( s ): s is string => s != null && s.trim() !== '' ).join( ' ' );
  const searchParams = new URLSearchParams( { q: searchTerms } );
  const hits = await fetchJson( `${ API_BASE }/search?${ searchParams.toString() }` );
  if ( !Array.isArray( hits ) ) return null;

  for ( const hit of hits as LrcLibRecord[] ) {
    const result = recordToResult( hit );
    if ( result != null ) return result;
  }
  return null;
}

export default { getLyrics };
