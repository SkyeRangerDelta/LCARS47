// -- LCARS Client --

// Imports
import {
  type Client,
  type Collection,
  type Guild,
  type GuildMember
} from 'discord.js';
import { type MongoClient } from 'mongodb';
import { type StatusInterface } from './Interfaces/StatusInterface.js';
import type { Command } from './Interfaces/CommandInterface';
import type PocketBase from 'pocketbase';
import type { BeszelSystemRecord } from './Interfaces/BeszelInterfaces.js';
import type { MediaPlayerService } from '../MediaPlayer/MediaPlayerService.js';
import type { AMPClient } from '../AMP/AMPClient.js';
import type { BeszelMonitor } from '../Monitors/BeszelMonitor.js';
import type { AMPMonitor } from '../Monitors/AMPMonitor.js';

// Exports
export interface LCARSClient extends Client {
  CMD_INDEX: Collection<
    string,
    Command
  >
  PLDYN: Guild
  MEMBER: GuildMember
  MEDIA_PLAYER: MediaPlayerService
  RDS_CONNECTION: MongoClient
  BESZEL_CLIENT: PocketBase
  BESZEL_SYSTEMS: BeszelSystemRecord[]
  /** Undefined when the beszel feature group is unset or the monitor failed to start. */
  BESZEL_MONITOR?: BeszelMonitor
  /** Undefined when the amp feature group is unset or the client failed to authenticate. */
  AMP_CLIENT?: AMPClient
  /** Undefined when AMP is unavailable or the monitor failed to start. */
  AMP_MONITOR?: AMPMonitor
  CLIENT_STATS: StatusInterface
}
