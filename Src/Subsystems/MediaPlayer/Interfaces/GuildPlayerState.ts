// -- GuildPlayerState --
// Per-guild internal state for MediaPlayerService. Not exported outside the
// MediaPlayer subsystem.

import { type AudioPlayer } from '@discordjs/voice';
import { type VoiceChannel } from 'discord.js';
import { type Track, type StreamHandle } from './Track.js';

export interface GuildPlayerState {
  voiceChannel: VoiceChannel;
  tracks: Track[];
  audioPlayer: AudioPlayer | null;
  currentStream: StreamHandle | null;
  isPlaying: boolean;
  emptyTimer: NodeJS.Timeout | null;
}
