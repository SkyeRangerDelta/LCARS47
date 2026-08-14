import { describe, it, expect } from 'vitest';
import { buildStatusEmbed } from './amp.js';
import type { AMPInstance, AMPMetric, AMPStatus } from '../../Subsystems/AMP/AMPInterfaces.js';

const INSTANCE: AMPInstance = {
  instanceId: 'abc-123',
  instanceName: 'MC01',
  friendlyName: 'Minecraft',
  module: 'MinecraftModule',
  moduleDisplayName: 'Minecraft',
  running: true,
  appState: 20,
  suspended: false,
  ip: '10.0.0.120',
  port: 25565,
  isHttps: false,
  metrics: {},
  endpoints: [],
  tags: []
};

const metric = ( over: Partial<AMPMetric> = {} ): AMPMetric => ( {
  rawValue: 0, maxValue: 0, percent: 0, units: '', ...over
} );

const status = ( over: Partial<AMPStatus> = {} ): AMPStatus => ( {
  state: 20, uptime: '04:35:12', metrics: {}, ...over
} );

const fieldValue = ( embed: ReturnType<typeof buildStatusEmbed>, name: string ): string | undefined =>
  embed.data.fields?.find( f => f.name === name )?.value;

describe( 'buildStatusEmbed', () => {
  it( 'reports the state, uptime and address', () => {
    const embed = buildStatusEmbed( INSTANCE, status() );

    expect( embed.data.title ).toBe( '🟢 Minecraft' );
    expect( fieldValue( embed, 'State' ) ).toBe( 'Ready' );
    expect( fieldValue( embed, 'Uptime' ) ).toBe( '4h 35m' );
    expect( fieldValue( embed, 'Address' ) ).toBe( '`10.0.0.120:25565`' );
  } );

  it( 'colours a Ready instance green and a Failed one red', () => {
    expect( buildStatusEmbed( INSTANCE, status( { state: 20 } ) ).data.color ).toBe( 0x00FF00 );
    expect( buildStatusEmbed( INSTANCE, status( { state: 100 } ) ).data.color ).toBe( 0xFF0000 );
  } );

  it( 'renders whatever metrics the module happens to publish', () => {
    const embed = buildStatusEmbed( INSTANCE, status( {
      metrics: {
        'CPU Usage': metric( { rawValue: 42, maxValue: 100, percent: 42, units: '%' } ),
        'Active Users': metric( { rawValue: 3, maxValue: 20, percent: 15 } )
      }
    } ) );

    expect( fieldValue( embed, 'CPU Usage' ) ).toBe( '42%' );
    expect( fieldValue( embed, 'Active Users' ) ).toBe( '3 / 20 (15%)' );
  } );

  it( 'stays inside the 25-field embed limit when a module is metric-happy', () => {
    const metrics: Record<string, AMPMetric> = {};
    for ( let i = 0; i < 30; i++ ) metrics[`Metric ${ i }`] = metric( { rawValue: i } );

    const embed = buildStatusEmbed( INSTANCE, status( { metrics } ) );

    expect( embed.data.fields?.length ).toBeLessThanOrEqual( 25 );
  } );

  it( 'shows a stopped instance as having no uptime', () => {
    const embed = buildStatusEmbed( INSTANCE, status( { state: 0, uptime: '00:00:00' } ) );

    expect( fieldValue( embed, 'State' ) ).toBe( 'Stopped' );
    expect( fieldValue( embed, 'Uptime' ) ).toBe( '—' );
  } );
} );
