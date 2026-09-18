// -- LyricLine --
// Local DTOs for lyrics. Defined here so @jellyfin/sdk types stay contained
// inside the JellyfinClient module — nothing else should import the SDK's
// LyricDto / LyricLine shapes directly. These same DTOs are also produced by
// the lrclib.net fallback (LrcLibClient) so the /lyrics command can render
// either source uniformly.

export interface LyricLine {
  text: string;
  /** Start offset in seconds when the source provides synced timing. */
  startSeconds?: number;
}

export interface LyricsResult {
  lines: LyricLine[];
  /** True when at least one line carries timing (synced/karaoke source). */
  synced: boolean;
}
