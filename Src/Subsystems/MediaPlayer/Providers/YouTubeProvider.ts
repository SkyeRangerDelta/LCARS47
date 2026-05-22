// -- YouTubeProvider --
// Wraps youtube-sr (search/metadata) and ytdlp-nodejs (stream extraction)
// behind the MediaProvider interface.

import { YouTube, type Playlist, type Video } from 'youtube-sr';
import { PassThrough } from 'stream';
import { StreamType } from '@discordjs/voice';

import {
  type MediaProvider,
  type ResolvedSearchResult,
  type SearchOptions
} from '../Interfaces/MediaProvider.js';
import { type StreamHandle, type Track } from '../Interfaces/Track.js';
import { convertSecondsToHMS } from '../../Utilities/MediaUtils.js';
import Utility from '../../Utilities/SysUtils.js';
import { YtDlpManager, getYtDlpManager } from '../YtDlpManager.js';

const YT_VIDEO_URL_REGEX = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=|^https?:\/\/youtu\.be\//;
const YT_PLAYLIST_URL_REGEX = /[?&]list=([A-Za-z0-9_-]+)/;
const YT_PURE_PLAYLIST_REGEX = /^https?:\/\/(www\.)?youtube\.com\/playlist\?list=/;
const MAX_PLAYLIST_TRACKS = 100;

export class YouTubeProvider implements MediaProvider {
  readonly id = 'youtube' as const;

  private readonly ytDlpManager: YtDlpManager;

  constructor( ytDlpManager?: YtDlpManager ) {
    this.ytDlpManager = ytDlpManager ?? getYtDlpManager();
  }

  isEnabled(): boolean {
    return true;
  }

  canHandle( query: string ): boolean {
    return YT_VIDEO_URL_REGEX.test( query ) || YT_PURE_PLAYLIST_REGEX.test( query );
  }

  async search( query: string, opts: SearchOptions ): Promise<ResolvedSearchResult> {
    // Playlist URLs (either pure /playlist?list= or watch?v=...&list=)
    // expand to up to MAX_PLAYLIST_TRACKS items. Pure /playlist URLs always
    // route here; watch URLs that *also* carry a list= parameter prefer the
    // playlist (matches how Jellyfin behaves with albums).
    if ( YT_PURE_PLAYLIST_REGEX.test( query ) || ( YT_VIDEO_URL_REGEX.test( query ) && YT_PLAYLIST_URL_REGEX.test( query ) ) ) {
      const playlistResult = await this.tryPlaylist( query, opts );
      if ( playlistResult != null ) return playlistResult;
      // If playlist fetch failed but the URL is also a video, fall through
      // to single-video handling.
    }

    let video: Video | undefined;

    if ( YT_VIDEO_URL_REGEX.test( query ) ) {
      try {
        video = await YouTube.getVideo( query );
      }
      catch ( err ) {
        Utility.log( 'warn', `[YT-PROVIDER] getVideo failed: ${ String( err ) }` );
        return { tracks: [], confidence: 'none' };
      }
    }
    else {
      const results = await YouTube.search( query, {
        type: 'video',
        limit: opts.limit ?? 1
      } );
      if ( results.length === 0 ) {
        return { tracks: [], confidence: 'none' };
      }
      video = results[0];
    }

    const track = this.videoToTrack( video, opts );
    if ( track == null ) return { tracks: [], confidence: 'none' };

    return {
      tracks: [track],
      confidence: this.canHandle( query ) ? 'exact' : 'fuzzy'
    };
  }

  private async tryPlaylist( query: string, opts: SearchOptions ): Promise<ResolvedSearchResult | null> {
    Utility.log( 'info', `[YT-PROVIDER] Expanding YouTube playlist URL.` );
    let playlist: Playlist;
    try {
      playlist = await YouTube.getPlaylist( query, { limit: MAX_PLAYLIST_TRACKS } );
    }
    catch ( err ) {
      Utility.log( 'warn', `[YT-PROVIDER] getPlaylist failed: ${ String( err ) }` );
      return null;
    }

    const videos = playlist.videos ?? [];
    Utility.log(
      'info',
      `[YT-PROVIDER] Playlist "${ playlist.title ?? '(untitled)' }" yielded ${ videos.length } video(s) (cap ${ MAX_PLAYLIST_TRACKS }).`
    );

    const tracks: Track[] = [];
    for ( const v of videos ) {
      const t = this.videoToTrack( v, opts );
      if ( t != null ) tracks.push( t );
      if ( tracks.length >= MAX_PLAYLIST_TRACKS ) break;
    }

    if ( tracks.length === 0 ) return null;
    return { tracks, confidence: 'exact' };
  }

  private videoToTrack( video: Video | undefined, opts: SearchOptions ): Track | null {
    if ( !video || !video.id || !video.title || !video.url ) return null;

    const duration = ( video.duration ?? 0 ) / 1000 || 1;
    const channelLabel = video.channel?.name ?? 'Unknown Channel';

    // `mqdefault` is 320x180 — closest to our 256-ish target without
    // pulling a 1280x720 maxres frame for every /play.
    const thumbnailUrl = video.thumbnail?.displayThumbnailURL?.( 'mqdefault' )
      ?? video.thumbnail?.url
      ?? undefined;

    return {
      id: video.id,
      source: 'youtube',
      sourceRef: video.url,
      title: video.title,
      url: video.url,
      duration,
      durationFriendly: convertSecondsToHMS( duration ),
      channelOrAlbumLabel: channelLabel,
      requestedBy: opts.requestedBy,
      playStart: 0,
      thumbnailUrl
    };
  }

  getStream( track: Track ): Promise<StreamHandle> {
    // Always read the YtDlp instance fresh from the manager — after an
    // operator-triggered /ytdlp-update the manager swaps in a new binary,
    // and we want the next /play to use it without restarting the bot.
    const yt = this.ytDlpManager.getYtDlp();
    const pt = new PassThrough();

    void yt.stream( track.sourceRef, {
      format: 'bestaudio/best',
      output: '-'
    } ).pipe( pt ).catch( ( err: unknown ) => {
      Utility.log( 'warn', `[YT-PROVIDER] yt-dlp stream failed: ${ String( err ) }` );
      pt.destroy();
    } );

    return Promise.resolve<StreamHandle>( {
      stream: pt,
      streamType: StreamType.Arbitrary,
      cleanup: () => { pt.destroy(); }
    } );
  }
}
