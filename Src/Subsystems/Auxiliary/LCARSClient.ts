// -- LCARS Client --

// Imports
import { type SlashCommandBuilder } from '@discordjs/builders';
import {
  type ChatInputCommandInteraction,
  type Client,
  type Collection,
  type Guild,
  type GuildMember
} from 'discord.js';
import { type LCARSMediaPlayer } from './Interfaces/MediaInterfaces.js';
import { type MongoClient } from 'mongodb';
import { type StatusInterface } from './Interfaces/StatusInterface.js';

// Exports
export interface LCARSClient extends Client {
  CMD_INDEX: Collection<
  string,
  {
    name: string
    data: SlashCommandBuilder
    ownerOnly?: boolean
    execute: ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ) => Promise<void>
    help: () => void
  }
  >
  PLDYN: Guild
  MEMBER: GuildMember
  MEDIA_QUEUE: Map<string, LCARSMediaPlayer>
  RDS_CONNECTION: MongoClient
  CLIENT_STATS: StatusInterface
}
