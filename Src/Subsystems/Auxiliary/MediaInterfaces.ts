// -- Media Player Interfaces --
import { GuildMember, Message, VoiceChannel } from 'discord.js'
import ytdl from 'ytdl-core'
import { AudioPlayer } from '@discordjs/voice'

export interface LCARSMediaSong {
  info: ytdl.videoInfo
  title: string
  url: string
  duration: number
  durationFriendly: string
  member: GuildMember
}

export interface LCARSMediaPlayer {
  voiceChannel: VoiceChannel
  songs: LCARSMediaSong[]
  songStream: AudioPlayer | null
  playingMsg: Message | null
  isPlaying: boolean
}
