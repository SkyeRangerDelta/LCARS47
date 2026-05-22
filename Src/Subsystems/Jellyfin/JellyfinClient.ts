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
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
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

  /** Search Jellyfin for items matching the query. Caller picks which item
   *  kinds to include; default is audio + containers (albums, playlists). */
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

    const res = await getItemsApi( api ).getItems( {
      userId,
      searchTerm: query,
      includeItemTypes,
      limit,
      recursive: true,
      fields: ['Path']
    } );

    return ( res.data.Items ?? [] )
      .map( item => this.toDto( item ) )
      .filter( ( item ): item is JellyfinItem => item != null );
  }

  /** Expand an album or playlist container to its individual audio items. */
  async expandContainer( parentId: string ): Promise<JellyfinItem[]> {
    const api = this.requireApi();
    const userId = this.requireUserId();

    const res = await getItemsApi( api ).getItems( {
      userId,
      parentId,
      recursive: true,
      includeItemTypes: [BaseItemKind.Audio],
      sortBy: ['ParentIndexNumber', 'IndexNumber', 'SortName'],
      fields: ['Path']
    } );

    return ( res.data.Items ?? [] )
      .map( item => this.toDto( item ) )
      .filter( ( item ): item is JellyfinItem => item != null );
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
      Artists?: string[];
      RunTimeTicks?: number;
      Path?: string;
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
      album: item.Album,
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
