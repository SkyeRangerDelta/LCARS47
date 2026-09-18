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
  FLAG_ROLE_NAMES,
  OFFICER_ROLE_NAME,
  guildHasFlagRole,
  guildHasOfficerRole,
  hasBridgeAuthority,
  hasFlagAuthority,
  hasFlagRole,
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

// -- Flag officer authority --
// Same shape as the bridge gate above, but this one decides who may widen the
// self-assignable role list, so the fail-closed path matters more than ever.

describe( 'hasFlagRole', () => {
  it.each( FLAG_ROLE_NAMES )( 'matches %s by name', flagName => {
    expect( hasFlagRole( fakeMember( '1', [ 'Crew', flagName ] ) ) ).toBe( true );
  } );

  it( 'ignores case', () => {
    expect( hasFlagRole( fakeMember( '1', [ 'fleet admiral' ] ) ) ).toBe( true );
    expect( hasFlagRole( fakeMember( '1', [ 'ADMIRAL' ] ) ) ).toBe( true );
  } );

  it( 'does not match a member holding neither rank', () => {
    expect( hasFlagRole( fakeMember( '1', [ 'Crew', OFFICER_ROLE_NAME ] ) ) ).toBe( false );
  } );

  it( 'does not treat Officer as a flag rank', () => {
    // The two gates are deliberately separate - bridge authority is not flag
    // authority, and an Officer must not be able to widen the role list.
    expect( hasFlagRole( fakeMember( '1', [ OFFICER_ROLE_NAME ] ) ) ).toBe( false );
  } );
} );

describe( 'guildHasFlagRole', () => {
  it( 'finds either rank on the guild', () => {
    expect( guildHasFlagRole( fakeMember( '1', [], [ 'Admiral' ] ).guild ) ).toBe( true );
    expect( guildHasFlagRole( fakeMember( '1', [], [ 'Fleet Admiral' ] ).guild ) ).toBe( true );
  } );

  it( 'reports false when the guild has neither', () => {
    expect( guildHasFlagRole( fakeMember( '1', [], [ 'Crew', 'Officer' ] ).guild ) ).toBe( false );
  } );
} );

describe( 'hasFlagAuthority', () => {
  it( 'admits a member holding a flag rank', () => {
    const member = fakeMember( '1', [ 'Admiral' ], [ 'Crew', 'Admiral' ] );

    expect( hasFlagAuthority( member, perms( false ) ) ).toBe( true );
  } );

  it( 'admits an administrator regardless of rank', () => {
    // The recovery path when the roles are mid-reshuffle.
    const member = fakeMember( '1', [ 'Crew' ], [ 'Crew', 'Admiral' ] );

    expect( hasFlagAuthority( member, perms( true ) ) ).toBe( true );
  } );

  it( 'refuses a member with neither rank nor admin', () => {
    const member = fakeMember( '1', [ 'Crew' ], [ 'Crew', 'Admiral' ] );

    expect( hasFlagAuthority( member, perms( false ) ) ).toBe( false );
  } );

  it( 'refuses an Officer, who holds bridge authority but not flag authority', () => {
    const member = fakeMember( '1', [ OFFICER_ROLE_NAME ], [ OFFICER_ROLE_NAME, 'Admiral' ] );

    expect( hasFlagAuthority( member, perms( false ) ) ).toBe( false );
  } );

  it( 'fails CLOSED when the guild has no flag role at all', () => {
    // The important one. A gate that opens because someone renamed a role is
    // worse than no gate, so a missing rank admits admins only.
    const member = fakeMember( '1', [ 'Crew' ], [ 'Crew' ] );

    expect( hasFlagAuthority( member, perms( false ) ) ).toBe( false );
  } );

  it( 'still admits an admin when the guild has no flag role', () => {
    const member = fakeMember( '1', [ 'Crew' ], [ 'Crew' ] );

    expect( hasFlagAuthority( member, perms( true ) ) ).toBe( true );
  } );

  it( 'honours ADMIN_USER_IDS over guild permissions when it is set', () => {
    adminIds.value = '42';

    expect( hasFlagAuthority( fakeMember( '42', [ 'Crew' ], [ 'Crew' ] ), perms( false ) ) ).toBe( true );
    // Administrator no longer counts once the allowlist is the authority.
    expect( hasFlagAuthority( fakeMember( '7', [ 'Crew' ], [ 'Crew' ] ), perms( true ) ) ).toBe( false );
  } );

  it( 'refuses when memberPermissions is null, as it is in DMs', () => {
    const member = fakeMember( '1', [ 'Crew' ], [ 'Crew' ] );

    expect( hasFlagAuthority( member, null ) ).toBe( false );
  } );
} );
