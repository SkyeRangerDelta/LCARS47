import { describe, it, expect } from 'vitest';
import { buildAuditEmbed, type AMPAuditEntry } from './AMPAudit.js';

const entry = ( over: Partial<AMPAuditEntry> = {} ): AMPAuditEntry => ( {
  layer: 'server',
  action: 'stop',
  target: 'PlDyn Valheim',
  operator: 'Skye',
  operatorId: '111111111111111111',
  outcome: 'completed',
  ...over
} );

const fieldValue = ( embed: ReturnType<typeof buildAuditEmbed>, name: string ): string | undefined =>
  embed.data.fields?.find( f => f.name === name )?.value;

describe( 'buildAuditEmbed', () => {
  it( 'records who did what to which target', () => {
    const embed = buildAuditEmbed( entry() );

    expect( embed.data.title ).toBe( '⚙️ Game server stop — PlDyn Valheim' );
    expect( fieldValue( embed, 'Operator' ) ).toBe( 'Skye' );
    expect( fieldValue( embed, 'Outcome' ) ).toBe( 'Completed' );
  } );

  it( 'keeps the operator ID out of the channel record', () => {
    // The ID stays in the console line for precise identification; the embed
    // people actually read just needs the name.
    const embed = buildAuditEmbed( entry() );
    const rendered = JSON.stringify( embed.data );

    expect( rendered ).not.toContain( '111111111111111111' );
  } );

  it( 'distinguishes the two control layers', () => {
    expect( buildAuditEmbed( entry( { layer: 'instance', action: 'start' } ) ).data.title )
      .toBe( '⚙️ Instance start — PlDyn Valheim' );
    expect( buildAuditEmbed( entry( { layer: 'server', action: 'start' } ) ).data.title )
      .toBe( '⚙️ Game server start — PlDyn Valheim' );
  } );

  it( 'does not report an unfinished action as either success or failure', () => {
    // A server still starting when the wait elapsed has neither succeeded nor
    // failed, and flattening the two would make the trail dishonest.
    const embed = buildAuditEmbed( entry( { outcome: 'pending' } ) );

    expect( fieldValue( embed, 'Outcome' ) ).toBe( 'Still in progress' );
    expect( embed.data.color ).toBe( 0xFFA500 );
  } );

  it( 'colours outcomes distinctly', () => {
    const colourOf = ( outcome: AMPAuditEntry['outcome'] ): number | undefined =>
      buildAuditEmbed( entry( { outcome } ) ).data.color;

    expect( colourOf( 'completed' ) ).toBe( 0x00FF00 );
    expect( colourOf( 'failed' ) ).toBe( 0xFF0000 );
    expect( colourOf( 'denied' ) ).toBe( 0x808080 );

    const all = ( ['completed', 'failed', 'denied', 'pending'] as const ).map( colourOf );
    expect( new Set( all ).size ).toBe( 4 );
  } );

  it( 'records a denied attempt', () => {
    const embed = buildAuditEmbed( entry( { outcome: 'denied' } ) );

    expect( fieldValue( embed, 'Outcome' ) ).toBe( 'Denied' );
    expect( fieldValue( embed, 'Operator' ) ).toContain( 'Skye' );
  } );

  it( 'carries the detail when there is one, and omits it otherwise', () => {
    expect( buildAuditEmbed( entry( { detail: 'Game server is Stopped.' } ) ).data.description )
      .toBe( 'Game server is Stopped.' );
    expect( buildAuditEmbed( entry() ).data.description ).toBeUndefined();
    expect( buildAuditEmbed( entry( { detail: '' } ) ).data.description ).toBeUndefined();
  } );
} );
