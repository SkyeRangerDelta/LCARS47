// -- Self-Assignable Role Utilities Tests --
// The safety floor is the part that has to be right. Everything else here is a
// convenience; the floor is the only thing standing between a curation mistake
// and handing ManageGuild to the whole server, so every exclusion gets a test.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { MongoClient } from 'mongodb';
import { Collection, PermissionFlagsBits, type Guild, type Role } from 'discord.js';

import {
  MAX_RENDERABLE_ROLES,
  OPTIONS_PER_MENU,
  addSelfRole,
  botHighestPosition,
  eligibleRoles,
  ensureRolesIndex,
  explainIneligibility,
  ineligibilityReason,
  listSelfRoles,
  pageRoles,
  removeSelfRole,
  resolveSelfRoles
} from './Roles_Utilities.js';
import type { SelfRoleRecord } from '../Auxiliary/Interfaces/RoleInterfaces.js';

beforeAll( () => {
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'warn' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

// -- Fakes --

const GUILD_ID = '999000999';
const BOT_CEILING = 50;

/**
 * A guild role. Defaults describe an ordinary, harmless game role - each test
 * changes only the one property it is about.
 */
function fakeRole( over: Record<string, unknown> = {} ): Role {
  const { permissions = [], ...rest } = over as { permissions?: bigint[] };

  return {
    id: 'role-1',
    name: 'Valheim',
    managed: false,
    position: 10,
    unicodeEmoji: null,
    guild: { id: GUILD_ID },
    permissions: {
      has: ( perm: bigint ) => permissions.includes( perm )
    },
    ...rest
  } as unknown as Role;
}

function fakeGuild( roles: Role[], ceiling: number = BOT_CEILING ): Guild {
  const cache = new Collection( roles.map( r => [ r.id, r ] ) );

  return {
    id: GUILD_ID,
    roles: { cache },
    members: { me: { roles: { highest: { position: ceiling } } } }
  } as unknown as Guild;
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

function fakeConnection( stored: SelfRoleRecord[] = [], failWith?: Error ) {
  const collection = {
    find: vi.fn( () => ( {
      sort: () => ( { toArray: () => Promise.resolve( stored ) } )
    } ) ),
    updateOne: vi.fn( () => Promise.resolve( { upsertedCount: 1, modifiedCount: 0 } ) ),
    deleteOne: vi.fn( () => Promise.resolve( { deletedCount: 1 } ) ),
    createIndex: vi.fn( () => {
      if ( failWith != null ) return Promise.reject( failWith );
      return Promise.resolve( 'roleId_1' );
    } )
  };

  const connection = {
    db: () => ( { collection: () => collection } )
  } as unknown as MongoClient;

  return { connection, collection };
}

// -- Tests --

describe( 'ineligibilityReason', () => {
  it( 'accepts an ordinary game role', () => {
    expect( ineligibilityReason( fakeRole(), BOT_CEILING ) ).toBeNull();
  } );

  it( 'rejects @everyone, which shares the guild id', () => {
    expect( ineligibilityReason( fakeRole( { id: GUILD_ID } ), BOT_CEILING ) ).toBe( 'everyone' );
  } );

  it( 'rejects managed roles that Discord will not let anyone assign', () => {
    expect( ineligibilityReason( fakeRole( { managed: true } ), BOT_CEILING ) ).toBe( 'managed' );
  } );

  it( 'rejects a role above the bot, which would be a guaranteed permissions error', () => {
    expect( ineligibilityReason( fakeRole( { position: 80 } ), BOT_CEILING ) ).toBe( 'hierarchy' );
  } );

  it( 'rejects a role level with the bot - Discord requires strictly below', () => {
    expect( ineligibilityReason( fakeRole( { position: BOT_CEILING } ), BOT_CEILING ) )
      .toBe( 'hierarchy' );
  } );

  it.each( [
    [ 'Administrator', PermissionFlagsBits.Administrator ],
    [ 'ManageGuild', PermissionFlagsBits.ManageGuild ],
    [ 'ManageRoles', PermissionFlagsBits.ManageRoles ],
    [ 'ManageChannels', PermissionFlagsBits.ManageChannels ],
    [ 'ManageMessages', PermissionFlagsBits.ManageMessages ],
    [ 'ManageWebhooks', PermissionFlagsBits.ManageWebhooks ],
    [ 'KickMembers', PermissionFlagsBits.KickMembers ],
    [ 'BanMembers', PermissionFlagsBits.BanMembers ],
    [ 'ModerateMembers', PermissionFlagsBits.ModerateMembers ],
    [ 'MentionEveryone', PermissionFlagsBits.MentionEveryone ],
    [ 'ViewAuditLog', PermissionFlagsBits.ViewAuditLog ]
  ] )( 'rejects a role carrying %s', ( _label, perm ) => {
    expect( ineligibilityReason( fakeRole( { permissions: [ perm ] } ), BOT_CEILING ) )
      .toBe( 'privileged' );
  } );

  it( 'allows harmless permissions through', () => {
    const harmless = fakeRole( {
      permissions: [ PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect ]
    } );

    expect( ineligibilityReason( harmless, BOT_CEILING ) ).toBeNull();
  } );
} );

describe( 'explainIneligibility', () => {
  it( 'has plain language for every reason the floor can produce', () => {
    const reasons = [ 'deleted', 'everyone', 'managed', 'hierarchy', 'privileged' ] as const;

    for ( const reason of reasons ) {
      expect( explainIneligibility( reason ) ).toBeTruthy();
    }
  } );
} );

describe( 'botHighestPosition', () => {
  it( 'reads the ceiling off the bot member', () => {
    expect( botHighestPosition( fakeGuild( [], 42 ) ) ).toBe( 42 );
  } );

  it( 'falls back to zero when the bot member is missing, excluding everything', () => {
    const guild = { roles: { cache: new Collection() }, members: { me: null } } as unknown as Guild;

    expect( botHighestPosition( guild ) ).toBe( 0 );
  } );
} );

describe( 'resolveSelfRoles', () => {
  it( 'marks an entry whose role has been deleted', () => {
    const resolved = resolveSelfRoles( fakeGuild( [] ), [ record() ] );

    expect( resolved[0].eligible ).toBe( false );
    expect( resolved[0].reason ).toBe( 'deleted' );
    expect( resolved[0].role ).toBeNull();
  } );

  it( 'keeps the stored name so a deleted role is still nameable', () => {
    const resolved = resolveSelfRoles( fakeGuild( [] ), [ record( { name: 'Old Game' } ) ] );

    expect( resolved[0].record.name ).toBe( 'Old Game' );
  } );

  it( 'reports entries that fail the floor rather than dropping them', () => {
    // /role list needs these - an entry that silently vanishes from the picker
    // is one a flag officer can never notice has gone bad.
    const role = fakeRole( { permissions: [ PermissionFlagsBits.ManageGuild ] } );
    const resolved = resolveSelfRoles( fakeGuild( [ role ] ), [ record() ] );

    expect( resolved ).toHaveLength( 1 );
    expect( resolved[0].eligible ).toBe( false );
    expect( resolved[0].reason ).toBe( 'privileged' );
  } );
} );

describe( 'eligibleRoles', () => {
  it( 'returns only roles that clear the floor', () => {
    const good = fakeRole( { id: 'a', name: 'Valheim' } );
    const bad = fakeRole( { id: 'b', name: 'Moderator', permissions: [ PermissionFlagsBits.KickMembers ] } );
    const guild = fakeGuild( [ good, bad ] );

    const result = eligibleRoles( guild, [ record( { roleId: 'a' } ), record( { roleId: 'b' } ) ] );

    expect( result.map( e => e.role.id ) ).toEqual( [ 'a' ] );
  } );

  it( 'sorts by guild position, highest first, to match the server role list', () => {
    const low = fakeRole( { id: 'low', position: 2 } );
    const high = fakeRole( { id: 'high', position: 30 } );
    const mid = fakeRole( { id: 'mid', position: 15 } );
    const guild = fakeGuild( [ low, high, mid ] );

    const result = eligibleRoles(
      guild,
      [ record( { roleId: 'low' } ), record( { roleId: 'high' } ), record( { roleId: 'mid' } ) ]
    );

    expect( result.map( e => e.role.id ) ).toEqual( [ 'high', 'mid', 'low' ] );
  } );

  it( 'is empty when the allowlist is empty', () => {
    expect( eligibleRoles( fakeGuild( [] ), [] ) ).toEqual( [] );
  } );

  it( 'carries the stored record through so the picker can show the game', () => {
    // The whole reason this returns pairs rather than bare roles.
    const role = fakeRole( { id: 'a', name: 'Belt Repairman' } );
    const result = eligibleRoles( fakeGuild( [ role ] ), [
      record( { roleId: 'a', name: 'Belt Repairman', game: 'Factorio' } )
    ] );

    expect( result[0].record.game ).toBe( 'Factorio' );
  } );
} );

describe( 'pageRoles', () => {
  function manyRoles( count: number ) {
    return Array.from( { length: count }, ( _, i ) => ( {
      role: fakeRole( { id: `r${i}`, position: count - i } ),
      record: record( { roleId: `r${i}` } )
    } ) );
  }

  it( 'keeps exactly 25 roles in a single page - PlDyn sits on this boundary', () => {
    const pages = pageRoles( manyRoles( OPTIONS_PER_MENU ) );

    expect( pages ).toHaveLength( 1 );
    expect( pages[0] ).toHaveLength( 25 );
  } );

  it( 'splits at 26, which is the very next role added', () => {
    const pages = pageRoles( manyRoles( OPTIONS_PER_MENU + 1 ) );

    expect( pages ).toHaveLength( 2 );
    expect( pages[0] ).toHaveLength( 25 );
    expect( pages[1] ).toHaveLength( 1 );
  } );

  it( 'never exceeds five menus, which is Discord\'s action row cap', () => {
    const pages = pageRoles( manyRoles( MAX_RENDERABLE_ROLES + 40 ) );

    expect( pages ).toHaveLength( 5 );
    expect( pages.flat() ).toHaveLength( MAX_RENDERABLE_ROLES );
  } );

  it( 'warns when roles are dropped rather than failing silently', () => {
    pageRoles( manyRoles( MAX_RENDERABLE_ROLES + 1 ) );

    expect( console.warn ).toHaveBeenCalledWith( expect.stringContaining( 'exceeds' ) );
  } );

  it( 'returns no pages for no roles', () => {
    expect( pageRoles( [] ) ).toEqual( [] );
  } );
} );

describe( 'allowlist storage', () => {
  it( 'reports an insert as added', async () => {
    const { connection } = fakeConnection();

    await expect( addSelfRole( connection, fakeRole(), '111', 'Valheim' ) ).resolves.toBe( 'added' );
  } );

  it( 'reports a relabel of an existing entry as updated', async () => {
    // Re-running /role add is how a game label gets corrected, so this has to
    // be distinguishable from a no-op.
    const { connection, collection } = fakeConnection();
    collection.updateOne.mockResolvedValueOnce( { upsertedCount: 0, modifiedCount: 1 } );

    await expect( addSelfRole( connection, fakeRole(), '111', 'Factorio' ) ).resolves.toBe( 'updated' );
  } );

  it( 'reports a re-add with identical data as unchanged', async () => {
    const { connection, collection } = fakeConnection();
    collection.updateOne.mockResolvedValueOnce( { upsertedCount: 0, modifiedCount: 0 } );

    await expect( addSelfRole( connection, fakeRole(), '111', 'Valheim' ) ).resolves.toBe( 'unchanged' );
  } );

  it( 'stores the game alongside the role', async () => {
    const { connection, collection } = fakeConnection();

    await addSelfRole( connection, fakeRole(), '111', 'Factorio' );

    const update = ( collection.updateOne.mock.calls[0] as unknown[] )[1] as { $set: { game?: string } };
    expect( update.$set.game ).toBe( 'Factorio' );
  } );

  it( 'refreshes name and game on every call, not only on insert', async () => {
    // $setOnInsert would leave a corrected label unapplied.
    const { connection, collection } = fakeConnection();

    await addSelfRole( connection, fakeRole(), '111', 'Factorio' );

    const update = ( collection.updateOne.mock.calls[0] as unknown[] )[1] as {
      $set: Record<string, unknown>
      $setOnInsert: Record<string, unknown>
    };
    expect( Object.keys( update.$set ).sort() ).toEqual( [ 'game', 'name' ] );
    expect( update.$setOnInsert.game ).toBeUndefined();
  } );

  it( 'leaves an existing game untouched when none is supplied', async () => {
    const { connection, collection } = fakeConnection();

    await addSelfRole( connection, fakeRole(), '111' );

    const update = ( collection.updateOne.mock.calls[0] as unknown[] )[1] as { $set: Record<string, unknown> };
    expect( 'game' in update.$set ).toBe( false );
  } );

  it( 'stores who added it and when', async () => {
    const { connection, collection } = fakeConnection();

    await addSelfRole( connection, fakeRole(), '111' );

    const update = ( collection.updateOne.mock.calls[0] as unknown[] )[1] as { $setOnInsert: SelfRoleRecord };
    expect( update.$setOnInsert.addedBy ).toBe( '111' );
    expect( update.$setOnInsert.addedAt ).toBeInstanceOf( Date );
  } );

  it( 'reports false when removing a role that was not listed', async () => {
    const { connection, collection } = fakeConnection();
    collection.deleteOne.mockResolvedValueOnce( { deletedCount: 0 } );

    await expect( removeSelfRole( connection, 'role-1' ) ).resolves.toBe( false );
  } );

  it( 'reads the stored allowlist back', async () => {
    const stored = [ record() ];
    const { connection } = fakeConnection( stored );

    await expect( listSelfRoles( connection ) ).resolves.toEqual( stored );
  } );

  it( 'survives a failed index creation at boot', async () => {
    const { connection } = fakeConnection( [], new Error( 'no permission' ) );

    await expect( ensureRolesIndex( connection ) ).resolves.toBeUndefined();
  } );
} );
