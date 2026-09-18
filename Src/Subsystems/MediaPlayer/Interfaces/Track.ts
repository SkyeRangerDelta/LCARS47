// -- Track --
// Source-agnostic representation of a queued piece of media.

import { type GuildMember } from 'discord.js';
import { type StreamType } from '@discordjs/voice';
import { type Readable } from 'stream';

export type ProviderId = 'youtube' | 'jellyfin' | 'local';

export interface Track {
  id: string;
  source: ProviderId;
  sourceRef: string;
  title: string;
  url: string;
  duration: number;
  durationFriendly: string;
  channelOrAlbumLabel: string;
  /** Album-level artist when distinct from the track's primary artist
   *  (compilations / mixtapes). Surfaced on /playing so the curator of
   *  the album is visible alongside the track artist. */
  albumArtist?: string;
  requestedBy: GuildMember;
  playStart: number;
  /** Public URL or signed URL pointing to a small (~256px) cover image.
   *  Sized by the source: YouTube returns a fixed-resolution thumbnail;
   *  Jellyfin transcodes server-side via maxWidth/maxHeight params. */
  thumbnailUrl?: string;
}

export interface StreamHandle {
  stream: Readable;
  streamType: StreamType;
  cleanup?: () => void;
}
