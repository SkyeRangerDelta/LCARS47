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
  requestedBy: GuildMember;
  playStart: number;
}

export interface StreamHandle {
  stream: Readable;
  streamType: StreamType;
  cleanup?: () => void;
}
