import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';
import { AMPMonitor, classifyTransition, describeState, type AMPAlertSink } from './AMPMonitor.js';
import type { AMPClient } from '../AMP/AMPClient.js';
import type { AMPInstance, AMPStatus } from '../AMP/AMPInterfaces.js';
import type { LCARSClient } from '../Auxiliary/LCARSClient.js';

const instance = ( id: string, name: string ): AMPInstance => ( {
  instanceId: id,
  instanceName: id.toUpperCase(),
  friendlyName: name,
  module: 'MinecraftModule',
  moduleDisplayName: 'Minecraft',
  running: true,
  appState: 20,
  suspended: false,
  metrics: {},
  tags: []
} );

const status = ( state: number ): AMPStatus => ( { state, uptime: '01:00:00', metrics: {} } );

let sendFn: Mock<AMPAlertSink>;
let probe: ReturnType<typeof vi.fn>;
let recentlyActedOn: ReturnType<typeof vi.fn>;

function makeMonitor( instances: AMPInstance[] ): AMPMonitor {
  const amp = {
    listInstances: async () => await Promise.resolve( instances ),
    probeInstance: probe,
    recentlyActedOn
  } as unknown as AMPClient;

  return new AMPMonitor( {
    client: {} as unknown as LCARSClient,
    amp,
    alertChannelId: 'chan-1',
    pollIntervalMs: 3_600_000,
    sendFn
  } );
}

beforeAll( () => {
  vi.spyOn( console, 'log' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'info' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'warn' ).mockImplementation( () => undefined );
  vi.spyOn( console, 'error' ).mockImplementation( () => undefined );
} );

afterAll( () => {
  vi.restoreAllMocks();
} );

beforeEach( () => {
  sendFn = vi.fn<AMPAlertSink>().mockResolvedValue( undefined );
  probe = vi.fn();
  recentlyActedOn = vi.fn().mockReturnValue( false );
} );

describe( 'classifyTransition', () => {
  it( 'treats a fall into Failed as a crash', () => {
    expect( classifyTransition( true, 20, 100 ) ).toBe( 'crashed' );
  } );

  it( 'treats a live server going quiet as an unexpected stop', () => {
    expect( classifyTransition( true, 20, 0 ) ).toBe( 'stopped' );
    expect( classifyTransition( true, 20, 50 ) ).toBe( 'stopped' );
  } );

  it( 'treats a live server becoming unreachable as the instance going offline', () => {
    expect( classifyTransition( true, 20, null ) ).toBe( 'offline' );
  } );

  it( 'announces a recovery only after something bad', () => {
    expect( classifyTransition( false, 100, 20 ) ).toBe( 'recovered' );
    expect( classifyTransition( false, null, 20 ) ).toBe( 'recovered' );

    // Coming up from a normal stopped state is routine, not a recovery.
    expect( classifyTransition( false, 0, 20 ) ).toBeNull();
  } );

  it( 'ignores movement between idle states', () => {
    expect( classifyTransition( false, 0, 50 ) ).toBeNull();
    expect( classifyTransition( false, 0, null ) ).toBeNull();
    expect( classifyTransition( false, null, 0 ) ).toBeNull();
  } );

  it( 'ignores a server merely starting up', () => {
    expect( classifyTransition( false, 0, 10 ) ).toBeNull();
    expect( classifyTransition( true, 10, 20 ) ).toBeNull();
  } );
} );

describe( 'describeState', () => {
  it( 'renders an unreachable instance as Offline', () => {
    expect( describeState( null ) ).toBe( 'Offline' );
  } );

  it( 'defers to the AMP state names otherwise', () => {
    expect( describeState( 20 ) ).toBe( 'Ready' );
    expect( describeState( 100 ) ).toBe( 'Failed' );
  } );
} );

describe( 'AMPMonitor sampling', () => {
  it( 'seeds without alerting — a bot restart is not a crash', async () => {
    probe.mockResolvedValue( status( 100 ) );
    const monitor = makeMonitor( [instance( 'a', 'CCCraft' )] );

    await monitor.start();

    expect( sendFn ).not.toHaveBeenCalled();
    expect( monitor.getTracked().get( 'a' )?.state ).toBe( 100 );

    monitor.stop();
  } );

  it( 'alerts when a running server falls over', async () => {
    probe.mockResolvedValueOnce( status( 20 ) ).mockResolvedValueOnce( status( 100 ) );
    const monitor = makeMonitor( [instance( 'a', 'CCCraft' )] );

    await monitor.start();
    await monitor.poll();

    expect( sendFn ).toHaveBeenCalledTimes( 1 );
    expect( sendFn.mock.calls[0][0].data.title ).toBe( '💥 SERVER CRASHED — CCCraft' );

    monitor.stop();
  } );

  it( 'stays quiet when an operator did it on purpose', async () => {
    recentlyActedOn.mockReturnValue( true );
    probe.mockResolvedValueOnce( status( 20 ) ).mockResolvedValueOnce( status( 0 ) );
    const monitor = makeMonitor( [instance( 'a', 'CCCraft' )] );

    await monitor.start();
    await monitor.poll();

    expect( sendFn ).not.toHaveBeenCalled();
    // Still tracked, just not announced.
    expect( monitor.getTracked().get( 'a' )?.state ).toBe( 0 );

    monitor.stop();
  } );

  it( 'requires two consecutive misses before declaring an instance offline', async () => {
    probe
      .mockResolvedValueOnce( status( 20 ) )  // seed
      .mockResolvedValueOnce( null )          // first miss — could be a blip
      .mockResolvedValueOnce( null );         // confirmed
    const monitor = makeMonitor( [instance( 'a', 'CCCraft' )] );

    await monitor.start();

    await monitor.poll();
    expect( sendFn ).not.toHaveBeenCalled();

    await monitor.poll();
    expect( sendFn ).toHaveBeenCalledTimes( 1 );
    expect( sendFn.mock.calls[0][0].data.title ).toBe( '⚠️ INSTANCE WENT OFFLINE — CCCraft' );

    monitor.stop();
  } );

  it( 'forgives a single missed sample that comes straight back', async () => {
    probe
      .mockResolvedValueOnce( status( 20 ) )
      .mockResolvedValueOnce( null )
      .mockResolvedValueOnce( status( 20 ) );
    const monitor = makeMonitor( [instance( 'a', 'CCCraft' )] );

    await monitor.start();
    await monitor.poll();
    await monitor.poll();

    expect( sendFn ).not.toHaveBeenCalled();

    monitor.stop();
  } );

  it( 'does not let a failed probe be mistaken for a crash', async () => {
    probe
      .mockResolvedValueOnce( status( 20 ) )
      .mockRejectedValueOnce( new Error( 'network wobble' ) );
    const monitor = makeMonitor( [instance( 'a', 'CCCraft' )] );

    await monitor.start();
    await monitor.poll();

    expect( sendFn ).not.toHaveBeenCalled();
    expect( monitor.getTracked().get( 'a' )?.state ).toBe( 20 );

    monitor.stop();
  } );

  it( 'suppresses alerts while muted but keeps tracking', async () => {
    probe.mockResolvedValueOnce( status( 20 ) ).mockResolvedValueOnce( status( 100 ) );
    const monitor = makeMonitor( [instance( 'a', 'CCCraft' )] );

    await monitor.start();
    monitor.mute( 60_000 );
    await monitor.poll();

    expect( sendFn ).not.toHaveBeenCalled();
    expect( monitor.getTracked().get( 'a' )?.state ).toBe( 100 );

    monitor.stop();
  } );

  it( 'stops watching an instance that is no longer running', async () => {
    const live = instance( 'a', 'CCCraft' );
    probe.mockResolvedValue( status( 20 ) );

    const instances = [live];
    const monitor = makeMonitor( instances );
    await monitor.start();
    expect( monitor.getTracked().size ).toBe( 1 );

    live.running = false;
    await monitor.poll();

    expect( monitor.getTracked().size ).toBe( 0 );

    monitor.stop();
  } );

  it( 'skips a sweep that is already running rather than piling on', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<AMPStatus>( r => { release = () => r( status( 20 ) ); } );
    probe.mockReturnValueOnce( gate ).mockResolvedValue( status( 20 ) );

    const monitor = makeMonitor( [instance( 'a', 'CCCraft' )] );

    const first = monitor.poll();
    await Promise.resolve();
    await monitor.poll();          // should be a no-op while the first is in flight

    release();
    await first;

    expect( probe ).toHaveBeenCalledTimes( 1 );

    monitor.stop();
  } );
} );
