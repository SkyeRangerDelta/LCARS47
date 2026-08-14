import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import type PocketBase from 'pocketbase';
import { BeszelMonitor, type AlertSink } from './BeszelMonitor.js';
import type { LCARSClient } from '../Auxiliary/LCARSClient.js';
import type { BeszelSystemRecord } from '../Auxiliary/Interfaces/BeszelInterfaces.js';

const DEBOUNCE_MS = 30_000;

const system = ( id: string, name: string, status: string ): BeszelSystemRecord => ( {
  id,
  collectionId: 'c',
  collectionName: 'systems',
  created: '2026-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z',
  name,
  host: '10.0.0.1',
  port: 45876,
  status,
  users: []
} );

let sendFn: ReturnType<typeof vi.fn>;
let client: LCARSClient;

function makeMonitor( getFullList: () => Promise<BeszelSystemRecord[]> ): BeszelMonitor {
  const pb = {
    collection: () => ( {
      getFullList,
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    } )
  } as unknown as PocketBase;

  return new BeszelMonitor( {
    client,
    pb,
    alertChannelId: 'chan-1',
    debounceMs: DEBOUNCE_MS,
    reconcileIntervalMs: 60_000,
    sendFn: sendFn as unknown as AlertSink
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
  vi.useFakeTimers();
  sendFn = vi.fn().mockResolvedValue( undefined );
  client = { BESZEL_SYSTEMS: [] } as unknown as LCARSClient;
} );

afterEach( () => {
  vi.useRealTimers();
} );

describe( 'BeszelMonitor seeding', () => {
  it( 'tracks current state without alerting — a bot restart is not a state change', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [
      system( 'a', 'moros', 'up' ),
      system( 'b', 'impulse', 'down' )
    ] ) );

    await monitor.start();
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS * 2 );

    expect( sendFn ).not.toHaveBeenCalled();
    expect( monitor.getKnownStates().get( 'a' )?.status ).toBe( 'up' );
    expect( monitor.getKnownStates().get( 'b' )?.status ).toBe( 'down' );

    await monitor.stop();
  } );

  it( 'populates BESZEL_SYSTEMS for /server-status autocomplete', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [system( 'a', 'moros', 'up' )] ) );

    await monitor.start();

    expect( client.BESZEL_SYSTEMS ).toHaveLength( 1 );

    await monitor.stop();
  } );

  it( 'falls back to polling when EventSource is unavailable', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [] ) );

    await monitor.start();

    // Node only exposes EventSource behind --experimental-eventsource, which
    // vitest does not set, so this is the fallback path by construction.
    expect( monitor.isRealtime() ).toBe( typeof globalThis.EventSource === 'function' );
    expect( monitor.isRunning() ).toBe( true );

    await monitor.stop();
    expect( monitor.isRunning() ).toBe( false );
  } );
} );

describe( 'BeszelMonitor transitions', () => {
  it( 'alerts once a state change survives the debounce window', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [system( 'a', 'moros', 'up' )] ) );
    await monitor.start();

    monitor.handleRecord( system( 'a', 'moros', 'down' ) );
    expect( sendFn ).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS );

    expect( sendFn ).toHaveBeenCalledTimes( 1 );
    expect( monitor.getKnownStates().get( 'a' )?.status ).toBe( 'down' );

    await monitor.stop();
  } );

  it( 'stays quiet when a host flaps back inside the debounce window', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [system( 'a', 'moros', 'up' )] ) );
    await monitor.start();

    monitor.handleRecord( system( 'a', 'moros', 'down' ) );
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS / 2 );
    monitor.handleRecord( system( 'a', 'moros', 'up' ) );
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS * 2 );

    expect( sendFn ).not.toHaveBeenCalled();
    expect( monitor.getKnownStates().get( 'a' )?.status ).toBe( 'up' );

    await monitor.stop();
  } );

  it( 'reports the state it finally settled on, not the one it passed through', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [system( 'a', 'moros', 'up' )] ) );
    await monitor.start();

    monitor.handleRecord( system( 'a', 'moros', 'pending' ) );
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS / 2 );
    monitor.handleRecord( system( 'a', 'moros', 'down' ) );
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS );

    expect( sendFn ).toHaveBeenCalledTimes( 1 );
    expect( monitor.getKnownStates().get( 'a' )?.status ).toBe( 'down' );

    await monitor.stop();
  } );

  it( 'tracks a newly discovered host silently', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [system( 'a', 'moros', 'up' )] ) );
    await monitor.start();

    monitor.handleRecord( system( 'z', 'newcomer', 'down' ) );
    // Stay inside the reconcile interval — a reconcile would legitimately drop
    // 'z' again, since the stubbed Beszel does not know about it.
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS + 1000 );

    expect( sendFn ).not.toHaveBeenCalled();
    expect( monitor.getKnownStates().get( 'z' )?.status ).toBe( 'down' );

    await monitor.stop();
  } );

  it( 'ignores records with no id or status', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [] ) );
    await monitor.start();

    monitor.handleRecord( { ...system( '', 'nameless', 'up' ) } );
    monitor.handleRecord( { ...system( 'a', 'moros', '' ) } );

    expect( monitor.getKnownStates().size ).toBe( 0 );

    await monitor.stop();
  } );
} );

describe( 'BeszelMonitor reconcile', () => {
  it( 'detects a change the realtime feed missed', async () => {
    let current = [system( 'a', 'moros', 'up' )];
    const monitor = makeMonitor( async () => await Promise.resolve( current ) );
    await monitor.start();

    current = [system( 'a', 'moros', 'down' )];
    await monitor.reconcile();
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS );

    expect( sendFn ).toHaveBeenCalledTimes( 1 );

    await monitor.stop();
  } );

  it( 'forgets hosts removed from Beszel', async () => {
    let current = [system( 'a', 'moros', 'up' ), system( 'b', 'impulse', 'up' )];
    const monitor = makeMonitor( async () => await Promise.resolve( current ) );
    await monitor.start();

    current = [system( 'a', 'moros', 'up' )];
    await monitor.reconcile();

    expect( monitor.getKnownStates().has( 'b' ) ).toBe( false );

    await monitor.stop();
  } );

  it( 'survives a Beszel outage without throwing', async () => {
    let fail = false;
    const monitor = makeMonitor( async () => {
      if ( fail ) throw new Error( 'beszel unreachable' );
      return await Promise.resolve( [system( 'a', 'moros', 'up' )] );
    } );
    await monitor.start();

    fail = true;
    await expect( monitor.reconcile() ).resolves.toBeUndefined();

    await monitor.stop();
  } );
} );

describe( 'BeszelMonitor muting', () => {
  it( 'suppresses alerts but keeps tracking state', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [system( 'a', 'moros', 'up' )] ) );
    await monitor.start();

    monitor.mute( 60_000 );
    expect( monitor.isMuted() ).toBe( true );

    monitor.handleRecord( system( 'a', 'moros', 'down' ) );
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS );

    expect( sendFn ).not.toHaveBeenCalled();
    expect( monitor.getKnownStates().get( 'a' )?.status ).toBe( 'down' );

    await monitor.stop();
  } );

  it( 'resumes alerting after unmute', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [system( 'a', 'moros', 'up' )] ) );
    await monitor.start();

    monitor.mute( 60_000 );
    monitor.unmute();
    expect( monitor.isMuted() ).toBe( false );
    expect( monitor.muteRemainingMs() ).toBe( 0 );

    monitor.handleRecord( system( 'a', 'moros', 'down' ) );
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS );

    expect( sendFn ).toHaveBeenCalledTimes( 1 );

    await monitor.stop();
  } );
} );

describe( 'BeszelMonitor alert embed', () => {
  it( 'headlines an offline transition', () => {
    const embed = BeszelMonitor.buildAlertEmbed( 'moros', 'up', 'down', Date.now() - 5 * 3600_000 );

    expect( embed.data.title ).toBe( '⚠️ SYSTEM OFFLINE — moros' );
    expect( embed.data.color ).toBe( 0xFF0000 );
    expect( embed.data.fields?.[0].value ).toBe( 'UP (held 5h)' );
    expect( embed.data.fields?.[1].value ).toBe( 'DOWN' );
  } );

  it( 'headlines a restoration', () => {
    const embed = BeszelMonitor.buildAlertEmbed( 'moros', 'down', 'up', Date.now() - 60_000 );

    expect( embed.data.title ).toBe( '✅ SYSTEM RESTORED — moros' );
    expect( embed.data.color ).toBe( 0x00FF00 );
  } );

  it( 'omits the hold duration when the transition was never observed', () => {
    const embed = BeszelMonitor.buildAlertEmbed( 'moros', 'up', 'down', null );

    expect( embed.data.fields?.[0].value ).toBe( 'UP' );
  } );

  it( 'falls back rather than throwing on a status it has never seen', () => {
    const embed = BeszelMonitor.buildAlertEmbed( 'moros', 'up', 'quantum', null );

    expect( embed.data.title ).toBe( '🔄 SYSTEM STATE CHANGE — moros' );
    expect( embed.data.color ).toBe( 0x5865F2 );
  } );
} );

describe( 'BeszelMonitor hold tracking', () => {
  it( 'does not claim a hold duration for a state it did not watch begin', async () => {
    const monitor = makeMonitor( async () => await Promise.resolve( [system( 'a', 'moros', 'up' )] ) );
    await monitor.start();

    // Beszel's systems.updated churns on every agent report, so seeding must
    // not pretend to know when the host entered this state.
    expect( monitor.getKnownStates().get( 'a' )?.since ).toBeNull();

    monitor.handleRecord( system( 'a', 'moros', 'down' ) );
    await vi.advanceTimersByTimeAsync( DEBOUNCE_MS );

    // Once we have watched a transition, the timestamp is ours and trustworthy.
    expect( monitor.getKnownStates().get( 'a' )?.since ).not.toBeNull();

    await monitor.stop();
  } );
} );
