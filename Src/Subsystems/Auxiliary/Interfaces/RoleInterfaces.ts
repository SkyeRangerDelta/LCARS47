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
  /** User id of the flag officer who added it. */
  addedBy: Snowflake
  addedAt: Date
}

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
