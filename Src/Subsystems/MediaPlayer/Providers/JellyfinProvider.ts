// -- JellyfinProvider --
// MediaProvider that searches Jellyfin's catalog and streams audio. When a
// track's underlying NAS path is reachable from the bot container, streams
// directly from disk via LocalFileProvider — otherwise falls back to the
// HTTP audio stream URL exposed by Jellyfin.

import { request } from 'https';
import { request as httpRequest } from 'http';
import { PassThrough } from 'stream';
import { StreamType } from '@discordjs/voice';
import { type IncomingMessage } from 'http';

import {
  type MediaProvider,
  type ResolvedSearchResult,
  type SearchOptions
} from '../Interfaces/MediaProvider.js';
import { type StreamHandle, type Track } from '../Interfaces/Track.js';
import { LocalFileProvider, LocalUnreachableError } from './LocalFileProvider.js';
import { type JellyfinClient } from '../../Jellyfin/JellyfinClient.js';
import { type JellyfinItem } from '../../Jellyfin/Interfaces/JellyfinItem.js';
import { convertSecondsToHMS } from '../../Utilities/MediaUtils.js';
import Utility from '../../Utilities/SysUtils.js';

export class JellyfinProvider implements MediaProvider {
  readonly id = 'jellyfin' as const;

  private readonly client: JellyfinClient;
  private readonly local: LocalFileProvider;

  constructor( client: JellyfinClient, local: LocalFileProvider ) {
    this.client = client;
    this.local = local;
  }

  isEnabled(): boolean {
    return this.client.isReady();
  }

  canHandle(): boolean {
    return false;
  }

  async search( query: string, opts: SearchOptions ): Promise<ResolvedSearchResult> {
    if ( !this.isEnabled() ) {
      Utility.log( 'info', '[JELLYFIN] search() called while not ready; skipping.' );
      return { tracks: [], confidence: 'none' };
    }

    const expandContainers = opts.expandContainers === true;
    const kinds: ReadonlyArray<'audio' | 'album' | 'playlist'> = expandContainers
      ? ['audio', 'album', 'playlist']
      : ['audio'];

    Utility.log(
      'info',
      `[JELLYFIN] Searching: "${ query }" (limit=${ opts.limit ?? 5 }, expandContainers=${ expandContainers }).`
    );
    const hits = await this.client.searchAudio( query, opts.limit ?? 5, kinds );
    Utility.log(
      'info',
      `[JELLYFIN] ${ hits.length } hit(s): ${
        hits.map( h => `${ h.kind }:${ h.name }` ).join( ' | ' ) || '(none)'
      }`
    );
    if ( hits.length === 0 ) return { tracks: [], confidence: 'none' };

    const top = hits[0];
    let items: JellyfinItem[];

    if ( expandContainers && ( top.kind === 'album' || top.kind === 'playlist' ) ) {
      Utility.log( 'info', `[JELLYFIN] Expanding ${ top.kind } "${ top.name }"...` );
      items = await this.client.expandContainer( top.id );
      Utility.log( 'info', `[JELLYFIN] Container yielded ${ items.length } track(s).` );
      if ( items.length === 0 ) {
        // Container was empty — fall back to track-shaped hits.
        items = hits.filter( h => h.kind === 'audio' );
      }
    }
    else {
      // Either expansion is off, or the top hit is already a track.
      items = [top];
    }

    const tracks = items
      .filter( item => item.kind === 'audio' )
      .map( item => this.itemToTrack( item, opts.requestedBy ) );

    if ( tracks.length === 0 ) {
      Utility.log( 'info', '[JELLYFIN] Hits present but no audio tracks after filtering.' );
      return { tracks: [], confidence: 'none' };
    }

    return {
      tracks,
      confidence: tracks.length > 1 ? 'exact' : 'fuzzy'
    };
  }

  async getStream( track: Track ): Promise<StreamHandle> {
    // 1. Try local file path first.
    if ( track.sourceRef !== '' ) {
      const localTrack: Track = { ...track, source: 'local' };
      try {
        return await this.local.getStream( localTrack );
      }
      catch ( err ) {
        if ( !( err instanceof LocalUnreachableError ) ) throw err;
        Utility.log(
          'info',
          `[JELLYFIN] NAS path unreachable, falling back to HTTP: ${ err.attemptedPath }`
        );
      }
    }

    // 2. Fall back to Jellyfin's HTTP audio stream endpoint. The id is
    //    encoded into the URL via buildStreamUrl, and we use the track.id
    //    as the Jellyfin item id (set in itemToTrack).
    const url = this.client.buildStreamUrl( track.id );
    return await this.openHttpStream( url );
  }

  // ---- Internals ----

  private itemToTrack( item: JellyfinItem, requestedBy: SearchOptions['requestedBy'] ): Track {
    const label = item.artist != null && item.album != null
      ? `${ item.artist } — ${ item.album }`
      : ( item.artist ?? item.album ?? 'Jellyfin Library' );

    return {
      id: item.id,
      source: 'jellyfin',
      // sourceRef = NAS path (used by LocalFileProvider). Empty string when
      // the server didn't return one; getStream then jumps straight to HTTP.
      sourceRef: item.path ?? '',
      title: item.name,
      url: `jellyfin://${ item.id }`,
      duration: item.duration || 1,
      durationFriendly: convertSecondsToHMS( item.duration || 1 ),
      channelOrAlbumLabel: label,
      requestedBy,
      playStart: 0,
      thumbnailUrl: this.client.buildImageUrl( item.id )
    };
  }

  private openHttpStream( url: string ): Promise<StreamHandle> {
    return new Promise( ( resolve, reject ) => {
      const transport = url.startsWith( 'https://' ) ? request : httpRequest;
      const req = transport( url, { method: 'GET' }, ( res: IncomingMessage ) => {
        if ( res.statusCode == null || res.statusCode >= 400 ) {
          reject( new Error( `[JELLYFIN] HTTP ${ res.statusCode ?? 'unknown' } from stream URL` ) );
          res.resume();
          return;
        }
        const pt = new PassThrough();
        res.pipe( pt );
        res.on( 'error', ( err ) => {
          Utility.log( 'warn', `[JELLYFIN] HTTP stream error: ${ String( err ) }` );
          pt.destroy();
        } );
        resolve( {
          stream: pt,
          streamType: StreamType.OggOpus,
          cleanup: () => { res.destroy(); pt.destroy(); }
        } );
      } );
      req.on( 'error', ( err ) => reject( err ) );
      req.end();
    } );
  }
}
