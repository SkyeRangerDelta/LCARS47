// -- JellyfinClient --
// Thin wrapper around @jellyfin/sdk. All SDK imports stay in this file —
// callers receive plain `JellyfinItem` DTOs and never see SDK types. Issue
// #35 explicitly calls out keeping the SDK from leaking through the
// codebase.
//
// Lifecycle:
//   const c = new JellyfinClient(config);
//   await c.connect();           // builds the SDK Api instance
//   await c.authenticate();      // user-by-name; stores access token + userId
//   const hits = await c.searchAudio('hello');
//
// Methods that need authentication assert it explicitly so callers see a
// clear failure if they skip the sequence.

import { Jellyfin, type Api } from '@jellyfin/sdk';
import { BaseItemKind, ItemFields, ItemSortBy } from '@jellyfin/sdk/lib/generated-client';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getSearchApi } from '@jellyfin/sdk/lib/utils/api/search-api';
import Utility from '../Utilities/SysUtils.js';
import { type JellyfinItem, type JellyfinItemKind } from './Interfaces/JellyfinItem.js';

const CLIENT_INFO = {
  name: 'LCARS47 JClient',
  version: '1.0.0'
};

const DEVICE_INFO = {
  id: 'LCARS47-Jellyfin-Service',
  name: 'LCARS47 Jellyfin Service'
};

export interface JellyfinClientConfig {
  host: string;
  port?: string | number;
  apiKey?: string;
  username: string;
  password: string;
  /** Optional bot version string for the SDK clientInfo block. */
  clientVersion?: string;
}

export class JellyfinClient {
  private readonly config: JellyfinClientConfig;
  private readonly baseUrl: string;
  private api: Api | null = null;
  private accessToken: string | null = null;
  private userId: string | null = null;

  constructor( config: JellyfinClientConfig ) {
    this.config = config;
    this.baseUrl = JellyfinClient.normaliseBaseUrl( config.host, config.port );
  }

  static normaliseBaseUrl( host: string, port?: string | number ): string {
    const trimmed = host.replace( /\/+$/, '' );
    if ( /^https?:\/\//.test( trimmed ) ) {
      return port != null && trimmed.replace( /^https?:\/\//, '' ).indexOf( ':' ) === -1
        ? `${ trimmed }:${ port }`
        : trimmed;
    }
    return port != null ? `http://${ trimmed }:${ port }` : `http://${ trimmed }`;
  }

  /** Construct the SDK Api instance. Does not perform any network I/O. */
  connect(): void {
    const sdk = new Jellyfin( {
      clientInfo: { ...CLIENT_INFO, version: this.config.clientVersion ?? CLIENT_INFO.version },
      deviceInfo: DEVICE_INFO
    } );
    // If we have a static API key, prefer it as the initial access token —
    // some endpoints accept it without per-user auth. authenticate() will
    // overwrite if it succeeds.
    this.api = sdk.createApi( this.baseUrl, this.config.apiKey ?? undefined );
  }

  /** User-by-name authentication. Stores the resulting access token + userId. */
  async authenticate(): Promise<void> {
    const api = this.requireApi();
    const res = await api.authenticateUserByName( this.config.username, this.config.password );
    const data = res.data;
    if ( data.AccessToken == null || data.User?.Id == null ) {
      throw new Error( '[JELLYFIN] Authentication response missing token or user id.' );
    }
    this.accessToken = data.AccessToken;
    this.userId = data.User.Id;
    Utility.log( 'proc', `[JELLYFIN] Authenticated as ${ data.User.Name ?? this.config.username }` );
  }

  isReady(): boolean {
    return this.api != null && this.accessToken != null && this.userId != null;
  }

  /** Search Jellyfin for items matching the query.
   *
   *  Jellyfin's SearchHints endpoint treats `searchTerm` as a literal
   *  substring — "patience demon hunter" looks for that exact phrase in
   *  one field, which never matches because Patience is in the Name and
   *  Demon Hunter is in the Artists field. To get cross-field AND-style
   *  matching we:
   *    1. Tokenize the query.
   *    2. Send the most distinctive token (longest) as searchTerm with an
   *       inflated limit (50) to grab a wider candidate pool.
   *    3. Hydrate candidates with full DTOs (Path, AlbumId, Artists).
   *    4. Locally filter to items where EVERY token appears in Name,
   *       Album, Artist, or AlbumArtist (case-insensitive).
   *    5. Trim to the caller's limit, preserving Jellyfin's relevance order. */
  async searchAudio(
    query: string,
    limit = 10,
    kinds: ReadonlyArray<'audio' | 'album' | 'playlist'> = ['audio', 'album', 'playlist']
  ): Promise<JellyfinItem[]> {
    const api = this.requireApi();
    const userId = this.requireUserId();

    const includeItemTypes = kinds.map( k => {
      switch ( k ) {
        case 'audio': return BaseItemKind.Audio;
        case 'album': return BaseItemKind.MusicAlbum;
        case 'playlist': return BaseItemKind.Playlist;
      }
    } );

    const tokens = JellyfinClient.tokenize( query );
    if ( tokens.length === 0 ) return [];

    // Use the longest token as the server-side search anchor (most likely
    // to be a distinctive title or artist word). If only one token, this
    // is just the query itself.
    const anchor = [...tokens].sort( ( a, b ) => b.length - a.length )[0];
    const candidateCap = Math.max( limit, 50 );

    const hintRes = await getSearchApi( api ).getSearchHints( {
      searchTerm: anchor,
      userId,
      limit: candidateCap,
      includeItemTypes,
      includeMedia: true,
      includeArtists: false,
      includeGenres: false,
      includeStudios: false,
      includePeople: false
    } );

    const hints = hintRes.data.SearchHints ?? [];
    if ( hints.length === 0 ) return [];

    const ids = hints.map( h => h.Id ?? h.ItemId ).filter( ( id ): id is string => id != null );
    if ( ids.length === 0 ) return [];

    const detail = await getItemsApi( api ).getItems( {
      userId,
      ids,
      fields: [ItemFields.Path]
    } );

    const byId = new Map<string, JellyfinItem & { _haystack: string }>();
    for ( const raw of detail.data.Items ?? [] ) {
      const dto = this.toDto( raw );
      if ( dto == null ) continue;
      // Build a single case-folded haystack from every searchable field;
      // we then require every token to be present in it.
      const rawItem = raw as { AlbumArtist?: string; Artists?: string[] };
      const haystack = [
        dto.name,
        dto.album,
        dto.artist,
        rawItem.AlbumArtist,
        ...( rawItem.Artists ?? [] )
      ].filter( ( s ): s is string => typeof s === 'string' ).join( ' ' ).toLowerCase();
      byId.set( dto.id, { ...dto, _haystack: haystack } );
    }

    const lowerTokens = tokens.map( t => t.toLowerCase() );
    const matches: JellyfinItem[] = [];
    for ( const id of ids ) {
      const entry = byId.get( id );
      if ( entry == null ) continue;
      if ( lowerTokens.every( t => entry._haystack.includes( t ) ) ) {
        const { _haystack: _drop, ...item } = entry;
        void _drop;
        matches.push( item );
        if ( matches.length >= limit ) break;
      }
    }
    return matches;
  }

  /** Split a free-form query into tokens. Strips punctuation, drops 1-char
   *  noise tokens, and lowercases for case-insensitive matching downstream. */
  private static tokenize( query: string ): string[] {
    return query
      .split( /\s+/ )
      .map( t => t.replace( /[^\p{L}\p{N}]+/gu, '' ) )
      .filter( t => t.length >= 2 );
  }

  /** Expand an album or playlist container to its individual audio items. */
  /** Expand a container (album or playlist) into its child audio tracks.
   *  Different container kinds need different queries:
   *    - MusicAlbum: `albumIds: [id]` — Jellyfin's intended way to fetch
   *      tracks of an album. `parentId` returns 0 results on many setups
   *      because the album's direct children may live under disc folders.
   *    - Playlist: `parentId` — playlists store track membership as
   *      parent-child relationships, and there's no `playlistIds` filter. */
  async expandContainer( containerId: string, kind: 'album' | 'playlist' = 'album' ): Promise<JellyfinItem[]> {
    const api = this.requireApi();
    const userId = this.requireUserId();

    const baseQuery = {
      userId,
      recursive: true,
      includeItemTypes: [BaseItemKind.Audio],
      sortBy: [ItemSortBy.ParentIndexNumber, ItemSortBy.IndexNumber, ItemSortBy.SortName],
      fields: [ItemFields.Path]
    };
    const query = kind === 'album'
      ? { ...baseQuery, albumIds: [containerId] }
      : { ...baseQuery, parentId: containerId };

    const res = await getItemsApi( api ).getItems( query );
    let items = ( res.data.Items ?? [] )
      .map( item => this.toDto( item ) )
      .filter( ( item ): item is JellyfinItem => item != null );

    // Defensive fallback: if albumIds returned nothing (very old Jellyfin
    // installs, or unusual library configurations), retry with parentId.
    if ( items.length === 0 && kind === 'album' ) {
      const fallback = await getItemsApi( api ).getItems( {
        ...baseQuery,
        parentId: containerId
      } );
      items = ( fallback.data.Items ?? [] )
        .map( item => this.toDto( item ) )
        .filter( ( item ): item is JellyfinItem => item != null );
    }

    return items;
  }

  /** Build a server-side resized cover-art URL for an item. Jellyfin
   *  transcodes to the requested dimensions so the bot doesn't need an
   *  image library. For audio items the Primary image is the album cover
   *  (Jellyfin returns it even when the audio item itself has no image). */
  buildImageUrl( itemId: string, maxSide = 256 ): string {
    const token = this.requireAccessToken();
    const params = new URLSearchParams( {
      api_key: token,
      maxWidth: String( maxSide ),
      maxHeight: String( maxSide ),
      quality: '80'
    } );
    return `${ this.baseUrl }/Items/${ encodeURIComponent( itemId ) }/Images/Primary?${ params.toString() }`;
  }

  /** Build a direct HTTP stream URL for an audio item. Prefers opus to
   *  avoid an FFmpeg roundtrip on the bot side. */
  buildStreamUrl( itemId: string ): string {
    const token = this.requireAccessToken();
    const userId = this.requireUserId();
    const params = new URLSearchParams( {
      api_key: token,
      userId,
      audioCodec: 'opus',
      container: 'opus',
      transcodingContainer: 'opus',
      transcodingProtocol: 'http'
    } );
    return `${ this.baseUrl }/Audio/${ encodeURIComponent( itemId ) }/universal?${ params.toString() }`;
  }

  // ---- Internals ----

  private requireApi(): Api {
    if ( this.api == null ) {
      throw new Error( '[JELLYFIN] Client not connected. Call connect() first.' );
    }
    return this.api;
  }

  private requireUserId(): string {
    if ( this.userId == null ) {
      throw new Error( '[JELLYFIN] Client not authenticated. Call authenticate() first.' );
    }
    return this.userId;
  }

  private requireAccessToken(): string {
    if ( this.accessToken == null ) {
      throw new Error( '[JELLYFIN] No access token. Call authenticate() first.' );
    }
    return this.accessToken;
  }

  private toDto( raw: unknown ): JellyfinItem | null {
    const item = raw as {
      Id?: string;
      Name?: string;
      Type?: string;
      AlbumArtist?: string;
      Album?: string;
      AlbumId?: string;
      Artists?: string[];
      RunTimeTicks?: number;
      Path?: string;
      ImageTags?: Record<string, string>;
      AlbumPrimaryImageTag?: string;
    };
    if ( item == null || item.Id == null || item.Name == null ) return null;

    const kind = JellyfinClient.toKind( item.Type );
    const durationSeconds = item.RunTimeTicks != null
      ? Math.floor( item.RunTimeTicks / 10_000_000 )
      : 0;

    return {
      id: item.Id,
      kind,
      name: item.Name,
      artist: item.Artists?.[0] ?? item.AlbumArtist,
      albumArtist: item.AlbumArtist,
      album: item.Album,
      albumId: item.AlbumId,
      hasOwnPrimaryImage: item.ImageTags?.Primary != null,
      duration: durationSeconds,
      path: item.Path
    };
  }

  private static toKind( type: string | undefined ): JellyfinItemKind {
    switch ( type ) {
      case 'Audio': return 'audio';
      case 'MusicAlbum': return 'album';
      case 'Playlist': return 'playlist';
      default: return 'other';
    }
  }
}
