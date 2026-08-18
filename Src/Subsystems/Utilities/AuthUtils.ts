// -- Authorisation Utilities --
// Shared gate for admin-only slash command actions.

import { PermissionFlagsBits, type PermissionsBitField } from 'discord.js';
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

export default { isAdminUser };
