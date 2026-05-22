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
  /** Album name for tracks; undefined for albums/playlists. */
  album?: string;
  /** Duration in seconds; 0 for containers (albums/playlists). */
  duration: number;
  /** The server-side filesystem path (translate to container view before reading). */
  path?: string;
}
