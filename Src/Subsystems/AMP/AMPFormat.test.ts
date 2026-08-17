import { describe, it, expect } from 'vitest';
import {
  AMP_STATE_NAMES,
  stateLabel,
  stateEmoji,
  stateColour,
  isTransitional,
  instanceState,
  formatMetric,
  formatUptime
} from './AMPFormat.js';
import type { AMPMetric } from './AMPInterfaces.js';

const metric = ( over: Partial<AMPMetric> = {} ): AMPMetric => ( {
  rawValue: 0, maxValue: 0, percent: 0, units: '', ...over
} );

describe( 'stateLabel', () => {
  it( 'names every state AMP publishes', () => {
    for ( const [value, name] of Object.entries( AMP_STATE_NAMES ) ) {
      expect( stateLabel( Number( value ) ) ).toBe( name );
    }
  } );

  it( 'labels the states that matter most', () => {
    expect( stateLabel( 20 ) ).toBe( 'Ready' );
    expect( stateLabel( 0 ) ).toBe( 'Stopped' );
    expect( stateLabel( 100 ) ).toBe( 'Failed' );
    expect( stateLabel( -1 ) ).toBe( 'Undefined' );
  } );

  it( 'surfaces the raw value for a state it does not know', () => {
    expect( stateLabel( 42 ) ).toBe( 'Unknown (42)' );
  } );
} );

describe( 'isTransitional', () => {
  it( 'treats the mid-flight states as transitional', () => {
    for ( const s of [5, 7, 10, 30, 40, 45, 70, 75] ) {
      expect( isTransitional( s ) ).toBe( true );
    }
  } );

  it( 'treats the settled states as not transitional', () => {
    for ( const s of [0, 20, 50, 100, 200] ) {
      expect( isTransitional( s ) ).toBe( false );
    }
  } );
} );

describe( 'stateEmoji / stateColour', () => {
  it( 'buckets Ready as green', () => {
    expect( stateEmoji( 20 ) ).toBe( '🟢' );
    expect( stateColour( 20 ) ).toBe( 0x00FF00 );
  } );

  it( 'buckets a stopped application as blue, not black', () => {
    // Black is reserved for an instance that is switched off entirely. A game
    // server that is merely stopped inside a running instance is one command
    // away from serving players, so the two must not look alike.
    expect( stateEmoji( 0 ) ).toBe( '🔵' );
    expect( stateEmoji( 50 ) ).toBe( '🔵' );
    expect( stateColour( 0 ) ).toBe( 0x3498DB );
  } );

  it( 'buckets Failed and Suspended as red', () => {
    expect( stateEmoji( 100 ) ).toBe( '🔴' );
    expect( stateColour( 200 ) ).toBe( 0xFF0000 );
  } );

  it( 'buckets transitional states as amber', () => {
    expect( stateEmoji( 10 ) ).toBe( '🟡' );
    expect( stateColour( 40 ) ).toBe( 0xFFA500 );
  } );

  it( 'falls back rather than throwing on an unknown state', () => {
    expect( stateEmoji( 42 ) ).toBe( '⚪' );
    expect( stateColour( 42 ) ).toBe( 0x5865F2 );
  } );
} );

describe( 'instanceState', () => {
  it( 'reads a stopped instance as Offline rather than Undefined', () => {
    // AMP reports AppState -1 for every instance whose daemon is down, because
    // there is no application to have a state. Rendering that literally made
    // every powered-off game server read as "Undefined".
    expect( instanceState( false, -1 ) ).toEqual( { label: 'Offline', emoji: '⚫', colour: 0x808080 } );
  } );

  it( 'still reads Offline even if AppState looks meaningful', () => {
    // Running is the authority on whether the instance is on at all.
    expect( instanceState( false, 20 ).label ).toBe( 'Offline' );
  } );

  it( 'reports the application state once the daemon is up', () => {
    expect( instanceState( true, 20 ) ).toEqual( { label: 'Ready', emoji: '🟢', colour: 0x00FF00 } );
    expect( instanceState( true, 0 ).label ).toBe( 'Stopped' );
    expect( instanceState( true, 10 ).label ).toBe( 'Starting' );
  } );

  it( 'reads an online instance with no application state yet as Initialising', () => {
    // The window right after an instance comes up, before the controller's
    // aggregate has re-polled it. Showing "Undefined" to an operator who just
    // started the thing is worse than useless.
    expect( instanceState( true, -1 ) ).toEqual( { label: 'Initialising', emoji: '🟡', colour: 0xFFA500 } );
  } );

  it( 'distinguishes a running instance with a stopped application from an offline one', () => {
    const idle = instanceState( true, 0 );
    const off = instanceState( false, 0 );

    expect( idle.label ).toBe( 'Stopped' );
    expect( off.label ).toBe( 'Offline' );

    // The whole point: they must be told apart at a glance in a list.
    expect( idle.emoji ).not.toBe( off.emoji );
    expect( idle.colour ).not.toBe( off.colour );
  } );
} );

describe( 'formatMetric', () => {
  it( 'renders a percentage metric as a bare percentage', () => {
    expect( formatMetric( 'CPU Usage', metric( { rawValue: 42, maxValue: 100, percent: 42, units: '%' } ) ) )
      .toBe( '42%' );
  } );

  it( 'converts large MB metrics to GB', () => {
    expect( formatMetric( 'Memory Usage', metric( { rawValue: 3276, maxValue: 8192, percent: 40, units: 'MB' } ) ) )
      .toBe( '3.2 / 8.0 GB (40%)' );
  } );

  it( 'keeps small MB metrics in MB', () => {
    expect( formatMetric( 'Memory Usage', metric( { rawValue: 128, maxValue: 512, percent: 25, units: 'MB' } ) ) )
      .toBe( '128 MB / 512 MB (25%)' );
  } );

  it( 'renders a unitless ratio metric', () => {
    expect( formatMetric( 'Active Users', metric( { rawValue: 3, maxValue: 20, percent: 15 } ) ) )
      .toBe( '3 / 20 (15%)' );
  } );

  it( 'drops the ratio when there is no maximum', () => {
    expect( formatMetric( 'Entities', metric( { rawValue: 1204 } ) ) ).toBe( '1204' );
  } );

  it( 'handles a metric name it has never seen', () => {
    expect( formatMetric( 'Warp Core Output', metric( { rawValue: 8, maxValue: 10, percent: 80, units: 'TW' } ) ) )
      .toBe( '8 TW / 10 TW (80%)' );
  } );

  it( 'rounds fractional percentages', () => {
    expect( formatMetric( 'CPU Usage', metric( { percent: 42.6, units: '%' } ) ) ).toBe( '43%' );
  } );
} );

describe( 'formatUptime', () => {
  it( 'treats a stopped instance as having no uptime', () => {
    expect( formatUptime( '00:00:00' ) ).toBe( '—' );
    expect( formatUptime( '' ) ).toBe( '—' );
    expect( formatUptime( undefined ) ).toBe( '—' );
  } );

  it( 'formats hours and minutes', () => {
    expect( formatUptime( '04:35:12' ) ).toBe( '4h 35m' );
  } );

  it( 'formats the colon-separated day form the live controller emits', () => {
    // Captured verbatim from amp.pldyn.net: a server up ten and a half hours.
    expect( formatUptime( '0:10:29:25' ) ).toBe( '10h 29m' );
    expect( formatUptime( '3:04:05:06' ) ).toBe( '3d 4h 5m' );
  } );

  it( 'formats a .NET TimeSpan carrying days', () => {
    expect( formatUptime( '5.12:30:01' ) ).toBe( '5d 12h 30m' );
  } );

  it( 'ignores fractional seconds', () => {
    expect( formatUptime( '04:35:12.847' ) ).toBe( '4h 35m' );
  } );

  it( 'treats an all-zero day form as no uptime', () => {
    expect( formatUptime( '0:00:00:00' ) ).toBe( '—' );
  } );

  it( 'reports sub-minute uptime rather than an empty string', () => {
    expect( formatUptime( '00:00:42' ) ).toBe( '< 1m' );
  } );

  it( 'passes through a shape it cannot parse', () => {
    expect( formatUptime( 'a while' ) ).toBe( 'a while' );
  } );
} );
