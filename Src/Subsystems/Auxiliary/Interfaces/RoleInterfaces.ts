// -- Self-Assignable Role Interfaces --

import { type Snowflake } from 'discord-api-types/globals';
import { type Role } from 'discord.js';

/** One entry on the self-assignable allowlist. */
export interface SelfRoleRecord {
  /** Discord role id. The document key. */
  roleId: Snowflake
  /**
   * Role name at the time it was added.
   *
   * Display only, and deliberately not kept in sync - the live role is the
   * authority for what it is called now. This exists so /role list can still
   * name an entry whose role has since been deleted.
   */
  name: string
  /**
   * The game this role belongs to, shown under the role name in the picker.
   *
   * Optional because the first entries predate the field, and because not every
   * self-assignable role is a game. Where it is absent the option simply has no
   * subtitle rather than an empty one.
   *
   * Refreshed whenever /role add names the role again, which is how an entry
   * gets relabelled without being removed and re-added.
   */
  game?: string
  /** User id of the flag officer who added it. */
  addedBy: Snowflake
  addedAt: Date
}

/**
 * An allowlist entry that currently passes the safety floor.
 *
 * Kept as a pair rather than a bare Role because the menu needs both halves:
 * the live role for its name, id and emoji, and the stored record for the game
 * it belongs to.
 */
export interface EligibleSelfRole {
  role: Role
  record: SelfRoleRecord
}

/** What a /role add call actually did. */
export type SelfRoleAddResult = 'added' | 'updated' | 'unchanged';

/** Why a role on the allowlist cannot currently be handed out. */
export type RoleIneligibility =
  | 'deleted'
  | 'managed'
  | 'hierarchy'
  | 'privileged'
  | 'everyone';

/**
 * An allowlist entry resolved against the live guild.
 *
 * `role` is null exactly when `reason` is 'deleted'; for every other reason the
 * role still exists but the safety floor rejects it.
 */
export interface ResolvedSelfRole {
  record: SelfRoleRecord
  role: Role | null
  eligible: boolean
  reason?: RoleIneligibility
}
