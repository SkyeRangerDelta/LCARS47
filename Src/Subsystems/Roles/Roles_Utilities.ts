// ---- Self-Assignable Role Utilities ----
// The allowlist behind /role, and the safety floor that sits under it.
//
// THE CENTRAL IDEA: the allowlist is the authority, the menu is only a cache.
//
// A rendered select menu is a snapshot. By the time someone picks from it the
// allowlist may have changed, a role may have been deleted, or a role may have
// been granted ManageGuild. So eligibility is recomputed from scratch on submit
// and every chosen id is checked against that fresh result. Nothing trusts what
// the menu said.
//
// The safety floor is the half that cannot be configured away. Curation decides
// what SHOULD be self-assignable; the floor decides what CAN be, and it is
// applied on every read and every write. A mistake on the allowlist therefore
// costs you a role that does not appear - never a role that hands out
// permissions it should not.

import { type Collection, type Db, type MongoClient } from 'mongodb';
import { type Guild, PermissionFlagsBits, type Role } from 'discord.js';

import Utility from '../Utilities/SysUtils.js';
import type {
  ResolvedSelfRole,
  RoleIneligibility,
  SelfRoleRecord
} from '../Auxiliary/Interfaces/RoleInterfaces.js';

// Constants
const COLLECTION_NAME = 'self_roles';

/** Discord's hard cap on options in one select menu. */
export const OPTIONS_PER_MENU = 25;

/** Action rows per message, and therefore select menus per message. */
export const MENUS_PER_MESSAGE = 5;

/** How many roles one /role select response can carry. */
export const MAX_RENDERABLE_ROLES = OPTIONS_PER_MENU * MENUS_PER_MESSAGE;

/**
 * Permissions that make a role administrative rather than cosmetic.
 *
 * Erring wide on purpose. A game role wrongly excluded is a visible annoyance
 * a flag officer can diagnose in seconds; a moderation role wrongly offered to
 * the whole server is a much worse afternoon.
 */
const PRIVILEGED_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ManageEmojisAndStickers,
  PermissionFlagsBits.ManageEvents,
  PermissionFlagsBits.ManageGuildExpressions,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ViewAuditLog
];

function getCollection( connection: MongoClient ): Collection<SelfRoleRecord> {
  const database: Db = connection.db( 'LCARS47_DS' );
  return database.collection<SelfRoleRecord>( COLLECTION_NAME );
}

// -- The safety floor --

/**
 * Why this role may not be self-assigned, or null if it may be.
 *
 * Order matters only for the message the caller shows; any one reason is
 * disqualifying on its own.
 *
 * @param role - The live guild role.
 * @param botHighestPosition - Position of LCARS' own highest role.
 */
export function ineligibilityReason(
  role: Role,
  botHighestPosition: number
): RoleIneligibility | null {
  // @everyone shares the guild id and cannot be added or removed at all.
  if ( role.id === role.guild.id ) return 'everyone';

  // Bot roles, booster roles and integration roles. Discord refuses to assign
  // these regardless of what LCARS thinks.
  if ( role.managed ) return 'managed';

  // Discord only lets a bot assign roles strictly below its own highest.
  // Offering one above it would produce a guaranteed Missing Permissions error.
  if ( role.position >= botHighestPosition ) return 'hierarchy';

  if ( PRIVILEGED_PERMISSIONS.some( perm => role.permissions.has( perm ) ) ) return 'privileged';

  return null;
}

/** Plain-language form of a rejection, for embeds and command replies. */
export function explainIneligibility( reason: RoleIneligibility ): string {
  switch ( reason ) {
    case 'deleted':
      return 'the role no longer exists';
    case 'everyone':
      return 'it is the @everyone role';
    case 'managed':
      return 'it is managed by Discord or an integration';
    case 'hierarchy':
      return 'it sits at or above LCARS\' own highest role';
    case 'privileged':
      return 'it carries administrative permissions';
  }
}

/** Position of LCARS' highest role - the ceiling on everything it can assign. */
export function botHighestPosition( guild: Guild ): number {
  return guild.members.me?.roles.highest.position ?? 0;
}

// -- Allowlist storage --

/** Every allowlist entry, oldest first. Unresolved - see resolveSelfRoles. */
export async function listSelfRoles( connection: MongoClient ): Promise<SelfRoleRecord[]> {
  return await getCollection( connection ).find( {} ).sort( { addedAt: 1 } ).toArray();
}

/**
 * Add a role to the allowlist.
 *
 * Upserts, so adding a role that is already listed is a no-op rather than an
 * error - it returns false to let the caller say "already listed".
 *
 * Does NOT apply the safety floor: the command layer checks that first so it
 * can explain the specific rejection. This is storage only.
 */
export async function addSelfRole(
  connection: MongoClient,
  role: Role,
  addedBy: string
): Promise<boolean> {
  const result = await getCollection( connection ).updateOne(
    { roleId: role.id },
    { $setOnInsert: { roleId: role.id, name: role.name, addedBy, addedAt: new Date() } },
    { upsert: true }
  );

  return result.upsertedCount === 1;
}

/**
 * Drop a role from the allowlist.
 *
 * Members who already hold the role keep it. Un-listing means "nobody new may
 * take this", not "revoke it from everyone" - a mass role strip is not
 * something a single slash command should be able to do by accident.
 *
 * @returns false when the role was not listed to begin with.
 */
export async function removeSelfRole( connection: MongoClient, roleId: string ): Promise<boolean> {
  const result = await getCollection( connection ).deleteOne( { roleId } );
  return result.deletedCount === 1;
}

/**
 * Create the lookup index. Idempotent, so calling it every boot is fine.
 */
export async function ensureRolesIndex( connection: MongoClient ): Promise<void> {
  try {
    await getCollection( connection ).createIndex( { roleId: 1 }, { unique: true } );
    Utility.log( 'info', '[ROLE-SYS] Index ready.' );
  }
  catch ( indexErr ) {
    Utility.log( 'warn', `[ROLE-SYS] Index creation failed: ${ ( indexErr as Error ).message }` );
  }
}

// -- Resolution --

/**
 * Resolve every allowlist entry against the live guild.
 *
 * Returns entries that fail the floor as well as those that pass, so /role list
 * can show a flag officer exactly which of their entries have gone stale and
 * why. Callers that just want the usable set take eligibleRoles instead.
 */
export function resolveSelfRoles( guild: Guild, records: SelfRoleRecord[] ): ResolvedSelfRole[] {
  const ceiling = botHighestPosition( guild );

  return records.map( record => {
    const role = guild.roles.cache.get( record.roleId ) ?? null;

    if ( role == null ) {
      return { record, role: null, eligible: false, reason: 'deleted' as const };
    }

    const reason = ineligibilityReason( role, ceiling );

    return reason == null
      ? { record, role, eligible: true }
      : { record, role, eligible: false, reason };
  } );
}

/**
 * The roles a member may actually pick right now, in Discord's own display
 * order (highest first) so the menu matches the server's role list.
 */
export function eligibleRoles( guild: Guild, records: SelfRoleRecord[] ): Role[] {
  return resolveSelfRoles( guild, records )
    .filter( resolved => resolved.eligible && resolved.role != null )
    .map( resolved => resolved.role! )
    .sort( ( a, b ) => b.position - a.position );
}

/**
 * Split the eligible roles into per-menu pages.
 *
 * Both caps here are Discord's, not ours: 25 options to a menu and 5 menus to a
 * message. PlDyn sits at exactly 25 game roles today, which is the boundary -
 * one more role and this starts returning two pages, so the paging path is
 * live from the start rather than theoretical.
 *
 * Anything past MAX_RENDERABLE_ROLES is dropped with a warning; growing beyond
 * that needs pagination buttons, which is a bridge to cross at 126 roles.
 */
export function pageRoles( roles: Role[] ): Role[][] {
  if ( roles.length > MAX_RENDERABLE_ROLES ) {
    Utility.log(
      'warn',
      `[ROLE-SYS] ${ roles.length } eligible roles exceeds the ${ MAX_RENDERABLE_ROLES } `
      + 'renderable in one message. The remainder will not be shown.'
    );
  }

  const pages: Role[][] = [];
  for ( let i = 0; i < Math.min( roles.length, MAX_RENDERABLE_ROLES ); i += OPTIONS_PER_MENU ) {
    pages.push( roles.slice( i, i + OPTIONS_PER_MENU ) );
  }

  return pages;
}

export default {
  OPTIONS_PER_MENU,
  MENUS_PER_MESSAGE,
  MAX_RENDERABLE_ROLES,
  ineligibilityReason,
  explainIneligibility,
  botHighestPosition,
  listSelfRoles,
  addSelfRole,
  removeSelfRole,
  ensureRolesIndex,
  resolveSelfRoles,
  eligibleRoles,
  pageRoles
};
