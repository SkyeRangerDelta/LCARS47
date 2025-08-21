// -- Media Player Interfaces --
import { type GuildMember, type Message, type VoiceChannel } from 'discord.js';
import { type AudioPlayer } from '@discordjs/voice';
import type { Video } from 'youtube-sr';

export interface LCARSMediaSong {
  info: Video;
  title: string;
  url: string;
  id: string;
  duration: number;
  durationFriendly: string;
  member: GuildMember;
  playStart: number;
  channelName: string;
}

export interface LCARSMediaPlayer {
  voiceChannel: VoiceChannel
  songs: LCARSMediaSong[]
  songStream: AudioPlayer | null
  playingMsg: Message | null
  isPlaying: boolean
}
