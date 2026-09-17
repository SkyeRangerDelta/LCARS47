// -- Profile Command Tests --
// buildProfileEmbed is the whole command once the record is fetched, so the
// tests sit on it directly rather than standing up an interaction.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { GuildMember, User } from 'discord.js';

import { buildProfileEmbed } from './profile.js';
import type { UserStatsRecord } from '../../Subsystems/Auxiliary/Interfaces/UserStatsInterface.js';

beforeAll( () => {
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

// -- Fakes --

function fakeUser( over: Partial<User> = {} ): User {
  return {
    id: '1234567890',
    username: 'skyeranger',
    displayAvatarURL: () => 'https://cdn.example/avatar.png',
    ...over
  } as unknown as User;
}

function fakeMember( over: Record<string, unknown> = {} ): GuildMember {
  const joined = new Date( Date.UTC( 2024, 2, 15 ) );
  return {
    displayName: 'Skye Ranger',
    joinedAt: joined,
    joinedTimestamp: joined.getTime(),
    ...over
  } as unknown as GuildMember;
}

function record( over: Partial<UserStatsRecord> = {} ): UserStatsRecord {
  return {
    id: '1234567890',
    username: 'skyeranger',
    firstSeen: new Date( Date.UTC( 2026, 0, 1 ) ),
    lastSeen: new Date( Date.UTC( 2026, 8, 1 ) ),
    MESSAGES: 12,
    COMMANDS: 4,
    COMMANDS_FAILED: 0,
    REACTIONS: 7,
    ...over
  };
}

/** Pull a field's value out of the built embed by name. */
function field( embed: ReturnType<typeof buildProfileEmbed>, name: string ): string | undefined {
  return embed.toJSON().fields?.find( f => f.name === name )?.value;
}

// -- Tests --

describe( 'buildProfileEmbed', () => {
  it( 'renders the three headline counters', () => {
    const embed = buildProfileEmbed( fakeUser(), fakeMember(), record() );

    expect( field( embed, 'Messages Sent' ) ).toBe( '12' );
    expect( field( embed, 'Commands Run' ) ).toBe( '4' );
    expect( field( embed, 'Reactions Added' ) ).toBe( '7' );
  } );

  it( 'prefers the guild display name over the username', () => {
    const embed = buildProfileEmbed( fakeUser(), fakeMember(), record() );

    expect( embed.toJSON().title ).toContain( 'Skye Ranger' );
  } );

  it( 'falls back to the username for a member who has left', () => {
    const embed = buildProfileEmbed( fakeUser(), null, record() );

    expect( embed.toJSON().title ).toContain( 'skyeranger' );
  } );

  it( 'omits the join field entirely when the member has left', () => {
    // The counters survive departure; the member object does not.
    const embed = buildProfileEmbed( fakeUser(), null, record() );

    expect( field( embed, 'Joined' ) ).toBeUndefined();
    expect( field( embed, 'Messages Sent' ) ).toBe( '12' );
  } );

  it( 'hides the failure count when nothing has failed', () => {
    const embed = buildProfileEmbed( fakeUser(), fakeMember(), record( { COMMANDS_FAILED: 0 } ) );

    expect( field( embed, 'Commands Failed' ) ).toBeUndefined();
  } );

  it( 'shows failures against the total attempts when there are any', () => {
    const embed = buildProfileEmbed(
      fakeUser(),
      fakeMember(),
      record( { COMMANDS: 4, COMMANDS_FAILED: 2 } )
    );

    expect( field( embed, 'Commands Failed' ) ).toBe( '2 of 6' );
  } );

  it( 'says so plainly when there is no record rather than showing zeroes', () => {
    const embed = buildProfileEmbed( fakeUser(), fakeMember(), null );

    expect( embed.toJSON().description ).toContain( 'No telemetry on file' );
    expect( embed.toJSON().fields ?? [] ).toHaveLength( 0 );
  } );

  it( 'always carries the footer explaining counters start at deployment', () => {
    // Without this the numbers read as lifetime totals, which they are not.
    const withRecord = buildProfileEmbed( fakeUser(), fakeMember(), record() );
    const without = buildProfileEmbed( fakeUser(), fakeMember(), null );

    expect( withRecord.toJSON().footer?.text ).toContain( 'LCARS deployment' );
    expect( without.toJSON().footer?.text ).toContain( 'LCARS deployment' );
  } );

  it( 'handles dates arriving from Mongo as strings', () => {
    // A driver round trip can hand back an ISO string rather than a Date.
    const raw = record( {
      firstSeen: '2026-01-01T00:00:00.000Z' as unknown as Date,
      lastSeen: '2026-09-01T00:00:00.000Z' as unknown as Date
    } );

    expect( () => buildProfileEmbed( fakeUser(), fakeMember(), raw ) ).not.toThrow();
    expect( field( buildProfileEmbed( fakeUser(), fakeMember(), raw ), 'First Logged' ) )
      .toBeTruthy();
  } );
} );
