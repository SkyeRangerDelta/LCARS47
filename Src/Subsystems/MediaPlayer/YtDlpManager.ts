// -- YtDlpManager --
// Owns the yt-dlp binary for the bot. The npm package `ytdlp-nodejs` is a
// thin wrapper around the actual yt-dlp executable, and that executable is
// the thing that breaks when YouTube changes extraction. This module
// centralises:
//   - which binary to use (defaults to /usr/local/bin/yt-dlp in container)
//   - in-place updating (atomic, dedupes concurrent calls)
//   - reporting the current version
// Operators trigger refresh via the /ytdlp-update admin command.

import { YtDlp, helpers } from 'ytdlp-nodejs';
import { existsSync, promises as fsp } from 'fs';
import { dirname } from 'path';
import { spawn } from 'child_process';
import Utility from '../Utilities/SysUtils.js';

const DEFAULT_CONTAINER_PATH = '/usr/local/bin/yt-dlp';

const EXTRACTION_ERROR_PATTERNS = [
  /\bERROR:/i,
  /Unable to extract/i,
  /Sign in to confirm/i,
  /Failed to extract/i,
  /HTTP Error 403/i,
  /HTTP Error 410/i
];

export function looksLikeYtDlpExtractionError( err: unknown ): boolean {
  const text = err instanceof Error ? err.message : String( err );
  return EXTRACTION_ERROR_PATTERNS.some( re => re.test( text ) );
}

export interface YtDlpManagerOptions {
  /** Override the binary path. If omitted, prefers /usr/local/bin/yt-dlp
   *  when it exists, otherwise lets ytdlp-nodejs pick its default. */
  binaryPath?: string;
}

export class YtDlpManager {
  private binaryPath: string | undefined;
  private ytdlp: YtDlp;
  private updateInFlight: Promise<void> | null = null;

  constructor( opts: YtDlpManagerOptions = {} ) {
    this.binaryPath = opts.binaryPath ?? YtDlpManager.detectBinaryPath();
    this.ytdlp = this.buildYtDlp();
  }

  /** Prefer the container path; otherwise ask ytdlp-nodejs where it cached
   *  the binary; otherwise return undefined and let the wrapper spawn from
   *  PATH. */
  static detectBinaryPath(): string | undefined {
    if ( existsSync( DEFAULT_CONTAINER_PATH ) ) return DEFAULT_CONTAINER_PATH;
    try {
      const found = helpers.findYtdlpBinary();
      if ( found != null && found !== '' ) return found;
    }
    catch { /* helpers.findYtdlpBinary throws on some platforms — ignore */ }
    return undefined;
  }

  getYtDlp(): YtDlp {
    return this.ytdlp;
  }

  getBinaryPath(): string | undefined {
    return this.binaryPath;
  }

  /** Force a fresh yt-dlp binary download. Concurrent callers share one
   *  download to avoid corrupting the binary. */
  update(): Promise<void> {
    if ( this.updateInFlight != null ) return this.updateInFlight;

    this.updateInFlight = ( async () => {
      try {
        Utility.log( 'info', '[YT-DLP] Refreshing yt-dlp binary...' );

        // helpers.downloadYtDlp takes a *directory* — it appends the
        // platform-specific filename itself. Also: it short-circuits when
        // the target file already exists, so a true "update" requires we
        // remove the existing binary first.
        const outDir = this.binaryPath != null
          ? dirname( this.binaryPath )
          : undefined;

        if ( this.binaryPath != null && existsSync( this.binaryPath ) ) {
          try {
            await fsp.unlink( this.binaryPath );
          }
          catch ( unlinkErr ) {
            Utility.log( 'warn', `[YT-DLP] Pre-update unlink failed: ${ String( unlinkErr ) }` );
          }
        }

        const downloadedTo = await helpers.downloadYtDlp( outDir );
        this.binaryPath = downloadedTo;

        // Rebuild the wrapper so it picks up the new binary (the YtDlp
        // instance caches the path it was constructed with).
        this.ytdlp = this.buildYtDlp();
        Utility.log( 'proc', `[YT-DLP] yt-dlp binary refreshed at ${ this.binaryPath }.` );
      }
      catch ( err ) {
        Utility.log( 'err', `[YT-DLP] Binary refresh failed: ${ String( err ) }` );
        throw err;
      }
      finally {
        this.updateInFlight = null;
      }
    } )();

    return this.updateInFlight;
  }

  /** Return the binary's reported version, or null if it can't be queried. */
  getVersion(): Promise<string | null> {
    const path = this.binaryPath ?? 'yt-dlp';
    return new Promise<string | null>( ( resolve ) => {
      const proc = spawn( path, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] } );
      let out = '';
      proc.stdout.on( 'data', ( d: Buffer ) => { out += d.toString(); } );
      proc.on( 'close', ( code ) => {
        resolve( code === 0 ? out.trim() : null );
      } );
      proc.on( 'error', () => resolve( null ) );
    } );
  }

  private buildYtDlp(): YtDlp {
    return this.binaryPath != null
      ? new YtDlp( { binaryPath: this.binaryPath } )
      : new YtDlp();
  }
}

// Singleton for the default app-wide manager. Tests can construct their own.
let defaultManager: YtDlpManager | null = null;

export function getYtDlpManager(): YtDlpManager {
  if ( defaultManager == null ) {
    defaultManager = new YtDlpManager();
  }
  return defaultManager;
}

export function setYtDlpManagerForTesting( m: YtDlpManager | null ): void {
  defaultManager = m;
}
