// -- Authorisation Utilities Tests --
// hasBridgeAuthority gates high warp. A gate that opens by accident is worse
// than no gate, so the failure modes get more attention here than the happy path.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Guild, GuildMember, PermissionsBitField } from 'discord.js';

const adminIds = { value: undefined as string | undefined };

vi.mock( './EnvUtils.js', () => ( {
  getEnv: () => ( { ADMIN_USER_IDS: adminIds.value } ),
  isFeatureEnabled: () => false
} ) );

// vi.mock is hoisted above the imports, so the static import below already
// sees the stubbed EnvUtils - no dynamic import needed.
import {
  OFFICER_ROLE_NAME,
  guildHasOfficerRole,
  hasBridgeAuthority,
  hasOfficerRole
} from './AuthUtils.js';

beforeEach( () => {
  adminIds.value = undefined;
} );

/** Just enough of a role cache for the `.some` calls the module makes. */
function roleCache( names: string[] ) {
  return { some: ( fn: ( r: { name: string } ) => boolean ) => names.map( name => ( { name } ) ).some( fn ) };
}

function fakeMember(
  id: string,
  memberRoles: string[],
  guildRoles: string[] = memberRoles
): GuildMember {
  const guild = { roles: { cache: roleCache( guildRoles ) } } as unknown as Guild;

  return {
    id,
    guild,
    roles: { cache: roleCache( memberRoles ) }
  } as unknown as GuildMember;
}

/** interaction.memberPermissions with or without Administrator. */
function perms( isAdmin: boolean ): Readonly<PermissionsBitField> {
  return { has: () => isAdmin } as unknown as Readonly<PermissionsBitField>;
}

describe( 'hasOfficerRole', () => {
  it( 'matches the Officer role by name', () => {
    expect( hasOfficerRole( fakeMember( '1', ['Crew', OFFICER_ROLE_NAME] ) ) ).toBe( true );
  } );

  it( 'ignores case', () => {
    expect( hasOfficerRole( fakeMember( '1', ['officer'] ) ) ).toBe( true );
    expect( hasOfficerRole( fakeMember( '1', ['OFFICER'] ) ) ).toBe( true );
  } );

  it( 'does not match a role that merely contains the word', () => {
    expect( hasOfficerRole( fakeMember( '1', ['Officer Cadet', 'Chief Officer'] ) ) ).toBe( false );
  } );

  it( 'is false for a member with no roles', () => {
    expect( hasOfficerRole( fakeMember( '1', [] ) ) ).toBe( false );
  } );
} );

describe( 'guildHasOfficerRole', () => {
  it( 'reports whether the role exists at all', () => {
    const withRole = fakeMember( '1', [], ['Crew', 'Officer'] ).guild;
    const without = fakeMember( '1', [], ['Crew'] ).guild;

    expect( guildHasOfficerRole( withRole ) ).toBe( true );
    expect( guildHasOfficerRole( without ) ).toBe( false );
  } );
} );

describe( 'hasBridgeAuthority', () => {
  it( 'clears a member holding the Officer role', () => {
    const member = fakeMember( '1', ['Officer'], ['Crew', 'Officer'] );

    expect( hasBridgeAuthority( member, perms( false ) ) ).toBe( true );
  } );

  it( 'refuses a member without it', () => {
    const member = fakeMember( '1', ['Crew'], ['Crew', 'Officer'] );

    expect( hasBridgeAuthority( member, perms( false ) ) ).toBe( false );
  } );

  it( 'clears an admin regardless of roles', () => {
    const member = fakeMember( '1', ['Crew'], ['Crew', 'Officer'] );

    expect( hasBridgeAuthority( member, perms( true ) ) ).toBe( true );
  } );

  it( 'clears a user on the ADMIN_USER_IDS allowlist', () => {
    adminIds.value = '999,1';
    const member = fakeMember( '1', ['Crew'], ['Crew', 'Officer'] );

    expect( hasBridgeAuthority( member, perms( false ) ) ).toBe( true );
  } );

  it( 'fails CLOSED when the guild has no Officer role', () => {
    // The role has been renamed or deleted. Everyone who is not an admin is
    // refused - silently opening the gate would be far worse.
    const member = fakeMember( '1', ['Crew', 'Captain'], ['Crew', 'Captain'] );

    expect( hasBridgeAuthority( member, perms( false ) ) ).toBe( false );
  } );

  it( 'still clears admins when the guild has no Officer role', () => {
    const member = fakeMember( '1', ['Crew'], ['Crew'] );

    expect( hasBridgeAuthority( member, perms( true ) ) ).toBe( true );
  } );

  it( 'refuses when there are no permissions at all', () => {
    const member = fakeMember( '1', ['Crew'], ['Crew', 'Officer'] );

    expect( hasBridgeAuthority( member, null ) ).toBe( false );
  } );
} );
