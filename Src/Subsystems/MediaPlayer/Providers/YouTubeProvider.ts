// -- YouTubeProvider --
// Wraps youtube-sr (search/metadata) and ytdlp-nodejs (stream extraction)
// behind the MediaProvider interface.

import { YouTube, type Video } from 'youtube-sr';
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

const YT_URL_REGEX = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=|youtu\.be\//;

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
    return YT_URL_REGEX.test( query );
  }

  async search( query: string, opts: SearchOptions ): Promise<ResolvedSearchResult> {
    let video: Video | undefined;

    if ( this.canHandle( query ) ) {
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

    if ( !video || !video.id || !video.title || !video.url ) {
      return { tracks: [], confidence: 'none' };
    }

    const duration = ( video.duration ?? 0 ) / 1000 || 1;
    const channelLabel = video.channel?.name ?? 'Unknown Channel';

    const track: Track = {
      id: video.id,
      source: 'youtube',
      sourceRef: video.url,
      title: video.title,
      url: video.url,
      duration,
      durationFriendly: convertSecondsToHMS( duration ),
      channelOrAlbumLabel: channelLabel,
      requestedBy: opts.requestedBy,
      playStart: 0
    };

    return {
      tracks: [track],
      confidence: this.canHandle( query ) ? 'exact' : 'fuzzy'
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
