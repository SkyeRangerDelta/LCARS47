// -- Authorisation Utilities --
// Shared gate for admin-only slash command actions.

import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type PermissionsBitField
} from 'discord.js';
import { getEnv } from './EnvUtils.js';

/**
 * Is this user allowed to run an admin-only action?
 *
 * ADMIN_USER_IDS is the authority when it is set. When it is not, the check
 * falls back to the invoker's guild Administrator permission.
 *
 * The fallback matters: commands like /amp are only *partly* privileged, so
 * they cannot use setDefaultMemberPermissions( Administrator ) — that hides
 * the whole command, read-only subcommands included. For those, this function
 * is the only gate, so it must never fall open.
 *
 * @param userId - Discord user id of the invoker.
 * @param memberPermissions - `interaction.memberPermissions`; null in DMs.
 */
export function isAdminUser(
  userId: string,
  memberPermissions: Readonly<PermissionsBitField> | null
): boolean {
  const allow = getEnv().ADMIN_USER_IDS;

  if ( allow != null && allow.trim() !== '' ) {
    return allow
      .split( ',' )
      .map( s => s.trim() )
      .filter( s => s.length > 0 )
      .includes( userId );
  }

  return memberPermissions?.has( PermissionFlagsBits.Administrator ) ?? false;
}

/**
 * Name of the Discord role that carries bridge officer authority.
 *
 * Matched by name rather than by ID so the check works on any guild without
 * configuration. Kept in one place so it can become an env var later without
 * touching call sites.
 */
export const OFFICER_ROLE_NAME = 'Officer';

function isOfficerRoleName( name: string ): boolean {
  return name.toLowerCase() === OFFICER_ROLE_NAME.toLowerCase();
}

/** Does this guild have a role by that name at all? */
export function guildHasOfficerRole( guild: Guild ): boolean {
  return guild.roles.cache.some( r => isOfficerRoleName( r.name ) );
}

/** Does this member hold the Officer role? */
export function hasOfficerRole( member: GuildMember ): boolean {
  return member.roles.cache.some( r => isOfficerRoleName( r.name ) );
}

/**
 * Is this member cleared to give orders reserved for bridge officers?
 *
 * Admins always are, which is the recovery path when the roles are mid-reshuffle.
 * If the guild has no Officer role at all the check fails CLOSED to admins only:
 * a gate that silently opens because its role was renamed is worse than no gate.
 *
 * @param member - The invoking member, fetched from the guild so role names resolve.
 * @param memberPermissions - `interaction.memberPermissions`; null in DMs.
 */
export function hasBridgeAuthority(
  member: GuildMember,
  memberPermissions: Readonly<PermissionsBitField> | null
): boolean {
  if ( isAdminUser( member.id, memberPermissions ) ) return true;
  if ( !guildHasOfficerRole( member.guild ) ) return false;

  return hasOfficerRole( member );
}

export default {
  isAdminUser,
  hasBridgeAuthority,
  hasOfficerRole,
  guildHasOfficerRole,
  OFFICER_ROLE_NAME
};
