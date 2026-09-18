// -- User Statistics Interfaces --
// Per-member activity counters. Deliberately counters and nothing else: no
// message content, no channel ids, no per-event rows. The whole point of #81
// was "messages sent, etc might be neat", not an analytics pipeline.

import { type Snowflake } from 'discord-api-types/globals';

/** Countable fields on a user's record - the keys bumpUserStat will accept. */
export type UserStatField =
  | 'MESSAGES'
  | 'COMMANDS'
  | 'COMMANDS_FAILED'
  | 'REACTIONS';

export interface UserStatsRecord {
  /** Discord user id. The document key - there is no separate _id lookup. */
  id: Snowflake
  /**
   * Last seen username, refreshed on every bump.
   *
   * Stored so a departed member's profile still renders something readable;
   * the guild member object is gone by then, but the counters are not.
   */
  username: string
  /** First activity LCARS recorded, not the Discord join date. */
  firstSeen: Date
  lastSeen: Date
  /** Non-bot guild messages sent. */
  MESSAGES: number
  /** Slash commands that ran to completion. */
  COMMANDS: number
  /** Slash commands that threw. */
  COMMANDS_FAILED: number
  /** Reactions added. Lifetime count - removals do not decrement. */
  REACTIONS: number
}
