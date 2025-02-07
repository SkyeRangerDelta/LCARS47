// -- LCARS Client --

// Imports
import {
  type Client,
  type Collection,
  type Guild,
  type GuildMember
} from 'discord.js';
import { type LCARSMediaPlayer } from './Interfaces/MediaInterfaces.js';
import { type MongoClient } from 'mongodb';
import { type StatusInterface } from './Interfaces/StatusInterface.js';
import type { Command } from './Interfaces/CommandInterface';

// Exports
export interface LCARSClient extends Client {
  CMD_INDEX: Collection<
    string,
    Command
  >
  PLDYN: Guild
  MEMBER: GuildMember
  MEDIA_QUEUE: Map<string, LCARSMediaPlayer>
  RDS_CONNECTION: MongoClient
  CLIENT_STATS: StatusInterface
}
