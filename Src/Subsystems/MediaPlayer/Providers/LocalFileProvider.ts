// -- LocalFileProvider --
// Streams an audio file from a path on disk (typically a NAS mount). Not
// user-facing for search; JellyfinProvider hands it pre-resolved tracks when
// Jellyfin reports a `Path` field that translates to a reachable file.
//
// The path-prefix map lets the Jellyfin server's view of paths (e.g.
// "/media/music/...") be translated to whatever those paths look like
// mounted inside the bot container (e.g. "/mnt/nas/music/..."). When no
// mapping matches, the path is used as-is.

import { createReadStream, promises as fsp, constants as fsc } from 'fs';
import { extname } from 'path';
import { StreamType } from '@discordjs/voice';

import {
  type MediaProvider,
  type ResolvedSearchResult
} from '../Interfaces/MediaProvider.js';
import { type StreamHandle, type Track } from '../Interfaces/Track.js';
import Utility from '../../Utilities/SysUtils.js';

export class LocalUnreachableError extends Error {
  constructor( public readonly attemptedPath: string, cause?: unknown ) {
    const causeText = cause instanceof Error ? cause.message : '';
    super(
      causeText.length > 0
        ? `Local audio path unreachable: ${ attemptedPath } (${ causeText })`
        : `Local audio path unreachable: ${ attemptedPath }`
    );
    this.name = 'LocalUnreachableError';
  }
}

interface PathMapping {
  from: string;
  to: string;
}

export function parsePathMap( raw: string | undefined ): PathMapping[] {
  if ( raw == null || raw.trim() === '' ) return [];
  return raw
    .split( ',' )
    .map( pair => pair.trim() )
    .filter( pair => pair.length > 0 )
    .map( pair => {
      const idx = pair.indexOf( '=>' );
      if ( idx === -1 ) return null;
      const from = pair.slice( 0, idx ).trim();
      const to = pair.slice( idx + 2 ).trim();
      if ( from === '' || to === '' ) return null;
      return { from, to };
    } )
    .filter( ( m ): m is PathMapping => m !== null );
}

export function translatePath( path: string, mappings: PathMapping[] ): string {
  for ( const m of mappings ) {
    if ( path.startsWith( m.from ) ) {
      return m.to + path.slice( m.from.length );
    }
  }
  return path;
}

const STREAM_TYPE_BY_EXT: Record<string, StreamType> = {
  '.opus': StreamType.OggOpus,
  '.ogg': StreamType.OggOpus,
  '.webm': StreamType.WebmOpus
};

export class LocalFileProvider implements MediaProvider {
  readonly id = 'local' as const;

  private readonly mappings: PathMapping[];

  constructor( pathMap?: string ) {
    this.mappings = parsePathMap( pathMap );
  }

  isEnabled(): boolean {
    return true;
  }

  canHandle(): boolean {
    return false;
  }

  search(): Promise<ResolvedSearchResult> {
    // LocalFileProvider is never searched directly; Jellyfin resolves tracks
    // and hands them to getStream().
    return Promise.resolve({ tracks: [], confidence: 'none' });
  }

  async getStream( track: Track ): Promise<StreamHandle> {
    const translated = translatePath( track.sourceRef, this.mappings );

    try {
      await fsp.access( translated, fsc.R_OK );
    }
    catch ( err ) {
      throw new LocalUnreachableError( translated, err );
    }

    const ext = extname( translated ).toLowerCase();
    const streamType = STREAM_TYPE_BY_EXT[ext] ?? StreamType.Arbitrary;

    const stream = createReadStream( translated );
    stream.on( 'error', ( err ) => {
      Utility.log( 'warn', `[LOCAL-PROVIDER] Read stream error on ${ translated }: ${ String( err ) }` );
    } );

    return {
      stream,
      streamType,
      cleanup: () => { stream.destroy(); }
    };
  }
}
