// -- MediaProvider --
// Abstraction every audio source implements. Phase 2 introduces this so the
// service can ask any source the same questions (search / open stream)
// regardless of where the audio actually lives.

import { type GuildMember } from 'discord.js';
import { type ProviderId, type StreamHandle, type Track } from './Track.js';

export type SearchConfidence = 'exact' | 'fuzzy' | 'none';

export interface ResolvedSearchResult {
  tracks: Track[];
  confidence: SearchConfidence;
}

export interface SearchOptions {
  limit?: number;
  requestedBy: GuildMember;
  /** When true, providers may return container items (albums, playlists)
   *  and expand them into their constituent tracks. When false/undefined,
   *  only individual audio tracks are returned. URL-shaped queries that
   *  explicitly target a container (e.g. a YouTube /playlist?list=… URL)
   *  bypass this flag and always expand. */
  expandContainers?: boolean;
  /** Explicit item kinds to search for. When set, providers should honour
   *  this directly instead of deriving kinds from `expandContainers` — used
   *  by /search's type filter (track / album / playlist). Jellyfin-specific;
   *  other providers may ignore it. */
  kinds?: ReadonlyArray<'audio' | 'album' | 'playlist'>;
}

export interface MediaProvider {
  readonly id: ProviderId;

  /** True when the provider is configured & ready to serve. */
  isEnabled(): boolean;

  /** True when the provider knows how to handle this URL-shaped query. */
  canHandle( query: string ): boolean;

  /** Search the source; an empty result means "no match here". */
  search( query: string, opts: SearchOptions ): Promise<ResolvedSearchResult>;

  /** Open an audio stream for a track that was previously yielded by search. */
  getStream( track: Track ): Promise<StreamHandle>;
}
