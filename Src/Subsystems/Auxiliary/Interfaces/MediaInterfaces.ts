// -- Media Player Interfaces --
import { type GuildMember, type Message, type VoiceChannel } from 'discord.js';
import type ytdl from '@distube/ytdl-core';
import { type AudioPlayer } from '@discordjs/voice';

export interface LCARSMediaSong {
  info: ytdl.videoInfo
  title: string
  url: string
  duration: number
  durationFriendly: string
  member: GuildMember
  playStart: number
}

export interface LCARSMediaPlayer {
  voiceChannel: VoiceChannel
  songs: LCARSMediaSong[]
  songStream: AudioPlayer | null
  playingMsg: Message | null
  isPlaying: boolean
}
