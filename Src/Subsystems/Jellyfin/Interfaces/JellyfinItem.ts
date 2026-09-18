// -- JellyfinItem --
// Local DTOs for Jellyfin items. Defined here so @jellyfin/sdk types stay
// contained inside the JellyfinClient module — nothing else in the
// codebase should ever import from `@jellyfin/sdk` directly.

export type JellyfinItemKind = 'audio' | 'album' | 'playlist' | 'other';

export interface JellyfinItem {
  id: string;
  kind: JellyfinItemKind;
  name: string;
  /** Artist (for tracks) or album-artist (for albums). */
  artist?: string;
  /** Album-level artist — distinct from `artist` on compilations / mixtapes
   *  where the track-level artist differs from whoever curated the album. */
  albumArtist?: string;
  /** Album name for tracks; undefined for albums/playlists. */
  album?: string;
  /** Parent album id, when known (audio tracks only). Used for fetching
   *  cover art when the track itself has no embedded image. */
  albumId?: string;
  /** True when this item has its own Primary image tag (rare for tracks,
   *  common for albums). When false, cover art should be sourced from the
   *  album via albumId. */
  hasOwnPrimaryImage?: boolean;
  /** Duration in seconds; 0 for containers (albums/playlists). */
  duration: number;
  /** The server-side filesystem path (translate to container view before reading). */
  path?: string;
}
