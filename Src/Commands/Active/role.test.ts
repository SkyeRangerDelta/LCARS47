// -- Role Command Tests --
// Two things here have to be right for the picker to behave: the defaults that
// make the menu open showing what you already hold, and the page-indexed
// customId the handler diffs against. Both are asserted directly.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { APIStringSelectComponent, GuildMember, Role } from 'discord.js';

import { buildListEmbed, buildMenus, renderOutcome } from './role.js';
import type { ResolvedSelfRole, SelfRoleRecord } from '../../Subsystems/Auxiliary/Interfaces/RoleInterfaces.js';

beforeAll( () => {
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'warn' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

// -- Fakes --

function fakeRole( id: string, name: string, over: Record<string, unknown> = {} ): Role {
  return {
    id,
    name,
    position: 10,
    managed: false,
    unicodeEmoji: null,
    guild: { id: 'guild-1' },
    permissions: { has: () => false },
    ...over
  } as unknown as Role;
}

/** A member holding the given role ids. */
function fakeMember( held: string[] = [] ): GuildMember {
  return {
    id: '1234567890',
    roles: { cache: new Map( held.map( id => [ id, fakeRole( id, id ) ] ) ) }
  } as unknown as GuildMember;
}

function record( over: Partial<SelfRoleRecord> = {} ): SelfRoleRecord {
  return {
    roleId: 'role-1',
    name: 'Valheim',
    addedBy: '1234567890',
    addedAt: new Date( Date.UTC( 2026, 0, 1 ) ),
    ...over
  };
}

/** Pull the built menu out of an action row as plain API data. */
function menuOf( rows: ReturnType<typeof buildMenus>, index = 0 ): APIStringSelectComponent {
  return rows[index].toJSON().components[0];
}

function manyRoles( count: number ): Role[] {
  return Array.from( { length: count }, ( _, i ) => fakeRole( `r${i}`, `Game ${i}` ) );
}

// -- Tests --

describe( 'buildMenus', () => {
  it( 'renders one option per eligible role', () => {
    const rows = buildMenus( [ fakeRole( 'a', 'Valheim' ), fakeRole( 'b', 'Minecraft' ) ], fakeMember() );

    expect( menuOf( rows ).options.map( o => o.label ) ).toEqual( [ 'Valheim', 'Minecraft' ] );
  } );

  it( 'uses the role id as the option value', () => {
    const rows = buildMenus( [ fakeRole( 'a', 'Valheim' ) ], fakeMember() );

    expect( menuOf( rows ).options[0].value ).toBe( 'a' );
  } );

  it( 'pre-selects roles the member already holds', () => {
    // The entire reason the picker is ephemeral rather than a shared board.
    const rows = buildMenus(
      [ fakeRole( 'a', 'Valheim' ), fakeRole( 'b', 'Minecraft' ) ],
      fakeMember( [ 'a' ] )
    );

    const options = menuOf( rows ).options;
    expect( options.find( o => o.value === 'a' )?.default ).toBe( true );
    expect( options.find( o => o.value === 'b' )?.default ).toBe( false );
  } );

  it( 'allows deselecting everything', () => {
    // minValues 0 is what makes "leave all my roles" expressible at all.
    const rows = buildMenus( [ fakeRole( 'a', 'Valheim' ) ], fakeMember( [ 'a' ] ) );

    expect( menuOf( rows ).min_values ).toBe( 0 );
  } );

  it( 'allows selecting every option at once', () => {
    const rows = buildMenus( manyRoles( 4 ), fakeMember() );

    expect( menuOf( rows ).max_values ).toBe( 4 );
  } );

  it( 'indexes the customId by page so the handler can scope its diff', () => {
    const rows = buildMenus( manyRoles( 30 ), fakeMember() );

    expect( menuOf( rows, 0 ).custom_id ).toBe( 'role_select_0' );
    expect( menuOf( rows, 1 ).custom_id ).toBe( 'role_select_1' );
  } );

  it( 'routes to the role command via the customId prefix', () => {
    // interactionCreate splits on '_' and looks the first segment up in
    // CMD_INDEX, which is keyed on data.name.
    const rows = buildMenus( [ fakeRole( 'a', 'Valheim' ) ], fakeMember() );

    expect( menuOf( rows ).custom_id.split( '_' )[0] ).toBe( 'role' );
  } );

  it( 'keeps 25 roles in one menu and splits at 26', () => {
    expect( buildMenus( manyRoles( 25 ), fakeMember() ) ).toHaveLength( 1 );
    expect( buildMenus( manyRoles( 26 ), fakeMember() ) ).toHaveLength( 2 );
  } );

  it( 'numbers the placeholder only when there is more than one menu', () => {
    expect( menuOf( buildMenus( manyRoles( 10 ), fakeMember() ) ).placeholder ).toBe( 'Game roles' );
    expect( menuOf( buildMenus( manyRoles( 30 ), fakeMember() ) ).placeholder )
      .toBe( 'Game roles (1 of 2)' );
  } );

  it( 'truncates a label past Discord\'s 100 character cap', () => {
    const rows = buildMenus( [ fakeRole( 'a', 'x'.repeat( 150 ) ) ], fakeMember() );

    expect( menuOf( rows ).options[0].label ).toHaveLength( 100 );
  } );

  it( 'carries a role\'s unicode emoji onto its option', () => {
    const rows = buildMenus( [ fakeRole( 'a', 'Valheim', { unicodeEmoji: '🪓' } ) ], fakeMember() );

    expect( menuOf( rows ).options[0].emoji?.name ).toBe( '🪓' );
  } );
} );

describe( 'renderOutcome', () => {
  it( 'names what was joined and what was left', () => {
    const text = renderOutcome( [ fakeRole( 'a', 'Valheim' ) ], [ fakeRole( 'b', 'Minecraft' ) ], [] );

    expect( text ).toContain( 'Valheim' );
    expect( text ).toContain( 'Minecraft' );
  } );

  it( 'says so plainly when a submission changed nothing', () => {
    expect( renderOutcome( [], [], [] ) ).toContain( 'No changes' );
  } );

  it( 'surfaces failures rather than reporting a silent success', () => {
    const text = renderOutcome( [], [], [ 'Star Citizen' ] );

    expect( text ).toContain( 'Failed' );
    expect( text ).toContain( 'Star Citizen' );
  } );

  it( 'reports partial success honestly when some roles failed', () => {
    const text = renderOutcome( [ fakeRole( 'a', 'Valheim' ) ], [], [ 'Star Citizen' ] );

    expect( text ).toContain( 'Valheim' );
    expect( text ).toContain( 'Star Citizen' );
  } );
} );

describe( 'buildListEmbed', () => {
  function resolved( over: Partial<ResolvedSelfRole> = {} ): ResolvedSelfRole {
    return { record: record(), role: fakeRole( 'role-1', 'Valheim' ), eligible: true, ...over };
  }

  it( 'points at /role add when nothing is configured', () => {
    expect( buildListEmbed( [] ).toJSON().description ).toContain( '/role add' );
  } );

  it( 'lists available roles', () => {
    const embed = buildListEmbed( [ resolved() ] ).toJSON();

    expect( embed.fields?.[0].name ).toContain( 'Available (1)' );
    expect( embed.fields?.[0].value ).toContain( 'Valheim' );
  } );

  it( 'calls out stale entries with the reason they are blocked', () => {
    // The whole point of the command - a bad entry vanishes from the picker,
    // so this is the only place a flag officer can see it went wrong.
    const embed = buildListEmbed( [
      resolved( { eligible: false, reason: 'privileged' } )
    ] ).toJSON();

    const unavailable = embed.fields?.find( f => f.name.includes( 'Unavailable' ) );
    expect( unavailable?.value ).toContain( 'administrative permissions' );
  } );

  it( 'names a deleted role from the stored record, since the role is gone', () => {
    const embed = buildListEmbed( [
      resolved( { role: null, eligible: false, reason: 'deleted', record: record( { name: 'Old Game' } ) } )
    ] ).toJSON();

    const unavailable = embed.fields?.find( f => f.name.includes( 'Unavailable' ) );
    expect( unavailable?.value ).toContain( 'Old Game' );
  } );

  it( 'omits the unavailable section entirely when everything is healthy', () => {
    const embed = buildListEmbed( [ resolved() ] ).toJSON();

    expect( embed.fields?.some( f => f.name.includes( 'Unavailable' ) ) ).toBe( false );
  } );

  it( 'warns when the list has outgrown what the picker can render', () => {
    const embed = buildListEmbed(
      Array.from( { length: 130 }, ( _, i ) => resolved( { role: fakeRole( `r${i}`, `Game ${i}` ) } ) )
    ).toJSON();

    expect( embed.footer?.text ).toContain( '125' );
  } );
} );
