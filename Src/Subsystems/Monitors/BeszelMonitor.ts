// -- BeszelMonitor --
// Push half of the Beszel integration. /server-status answers when asked;
// this watches for hosts changing state and says something without being
// asked.
//
// Beszel is PocketBase underneath, so the primary feed is a realtime
// subscription on the `systems` collection. A reconcile timer runs regardless:
// it is the safety net if the realtime socket drops, the fallback when
// EventSource is unavailable, and the thing that keeps LCARS47.BESZEL_SYSTEMS
// fresh so /server-status autocomplete picks up hosts added since boot.
//
// Both feeds funnel through handleRecord(), so there is exactly one place that
// decides "this is a change" and one place that emits — which is what makes
// the polling fallback nearly free.

import { EmbedBuilder, type TextChannel } from 'discord.js';
import type PocketBase from 'pocketbase';

import Utility from '../Utilities/SysUtils.js';
import { beszel_getSystems, formatUptime } from '../RemoteDS/Beszel_Utilities.js';
import type { LCARSClient } from '../Auxiliary/LCARSClient.js';
import type { BeszelSystemRecord } from '../Auxiliary/Interfaces/BeszelInterfaces.js';

const DEFAULT_DEBOUNCE_MS = 30_000;
const REALTIME_RECONCILE_MS = 5 * 60_000;
const POLLING_RECONCILE_MS = 60_000;

/**
 * How stale the tracked state may be before a read refreshes it on demand.
 *
 * The background reconcile exists to catch missed *transitions*, and running it
 * every few seconds would be wasteful. But a status report is read by a human
 * who expects it to be current, so reads top the data up themselves rather than
 * showing whatever the last sweep happened to leave behind.
 */
const FRESHNESS_TARGET_MS = 5_000;

const STATUS_COLOUR: Readonly<Record<string, number>> = {
  up: 0x00FF00,
  down: 0xFF0000,
  paused: 0x808080,
  pending: 0xFFA500
};

/** What the alert says depends on where the host landed, not where it came from. */
const STATUS_HEADLINE: Readonly<Record<string, string>> = {
  up: '✅ SYSTEM RESTORED',
  down: '⚠️ SYSTEM OFFLINE',
  paused: '⏸️ SYSTEM PAUSED',
  pending: '🔄 SYSTEM PENDING'
};

export interface TrackedSystem {
  name: string;
  status: string;
  /**
   * When the system entered this state, as a UTC ms timestamp — or null when
   * we did not observe the transition ourselves.
   *
   * Beszel's `systems.updated` field churns on every agent report, so it is
   * not a usable proxy for "in this state since". Rather than print a
   * confidently wrong duration, seeded and newly-discovered systems carry null
   * and the duration is simply omitted until we watch one actually change.
   */
  since: number | null;
}

export type AlertSink = ( embed: EmbedBuilder ) => Promise<void>;

export interface BeszelMonitorOptions {
  client: LCARSClient;
  pb: PocketBase;
  alertChannelId: string;
  reconcileIntervalMs?: number;
  debounceMs?: number;
  /** Injected for tests; defaults to posting into the alert channel. */
  sendFn?: AlertSink;
}

export class BeszelMonitor {
  private readonly client: LCARSClient;
  private readonly pb: PocketBase;
  private readonly alertChannelId: string;
  private readonly debounceMs: number;
  private readonly configuredReconcileMs: number | undefined;
  private readonly sendFn: AlertSink;

  private readonly lastState = new Map<string, TrackedSystem>();
  private readonly pending = new Map<string, { status: string; timer: NodeJS.Timeout }>();

  private alertChannel: TextChannel | null = null;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private started = false;
  /** We successfully opened a subscription. Says nothing about it still being alive. */
  private subscribed = false;
  private lastReconcileAt = 0;
  private mutedUntil = 0;

  constructor( opts: BeszelMonitorOptions ) {
    this.client = opts.client;
    this.pb = opts.pb;
    this.alertChannelId = opts.alertChannelId;
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.configuredReconcileMs = opts.reconcileIntervalMs;
    this.sendFn = opts.sendFn ?? ( async embed => { await this.report( embed ); } );
  }

  /**
   * Seed current state, subscribe if we can, and start the reconcile timer.
   * Nothing is emitted for the seed — a bot restart is not a state change.
   */
  async start(): Promise<void> {
    if ( this.started ) return;
    this.started = true;

    const systems = await beszel_getSystems( this.pb );
    this.seed( systems );
    this.client.BESZEL_SYSTEMS = systems;
    this.lastReconcileAt = Date.now();

    // pocketbase's realtime client needs a global EventSource. Node has one,
    // but only behind --experimental-eventsource; without the flag the
    // subscription throws and the monitor would silently never fire.
    if ( typeof globalThis.EventSource === 'function' ) {
      try {
        await this.pb.collection( 'systems' ).subscribe( '*', event => {
          this.handleRecord( event.record as unknown as BeszelSystemRecord );
        } );
        this.subscribed = true;
        Utility.log( 'proc', `[BESZEL-MON] Realtime subscription active - tracking ${ systems.length } systems.` );
      }
      catch ( err ) {
        Utility.log( 'warn', `[BESZEL-MON] Realtime subscribe failed: ${ ( err as Error ).message }` );
      }
    }
    else {
      Utility.log( 'warn',
        '[BESZEL-MON] EventSource unavailable - falling back to polling. Start node with --experimental-eventsource.' );
    }

    const interval = this.configuredReconcileMs
      ?? ( this.subscribed ? REALTIME_RECONCILE_MS : POLLING_RECONCILE_MS );

    this.reconcileTimer = setInterval( () => { void this.reconcile(); }, interval );
    this.reconcileTimer.unref();

    Utility.log( 'info',
      `[BESZEL-MON] Reconcile every ${ Math.round( interval / 1000 ) }s, ${ Math.round( this.debounceMs / 1000 ) }s debounce.` );
  }

  async stop(): Promise<void> {
    if ( this.reconcileTimer != null ) {
      clearInterval( this.reconcileTimer );
      this.reconcileTimer = null;
    }

    for ( const { timer } of this.pending.values() ) clearTimeout( timer );
    this.pending.clear();

    if ( this.subscribed ) {
      try {
        await this.pb.collection( 'systems' ).unsubscribe( '*' );
      }
      catch ( err ) {
        Utility.log( 'warn', `[BESZEL-MON] Unsubscribe failed: ${ ( err as Error ).message }` );
      }
      this.subscribed = false;
    }

    this.started = false;
  }

  /**
   * Is the realtime feed alive *right now*?
   *
   * Deliberately not a stored flag. The PocketBase SDK reconnects a dropped
   * socket on its own but gives up after a bounded number of attempts, so a
   * boot-time "we subscribed successfully" would keep claiming realtime long
   * after detection had quietly degraded to the reconcile sweep. Asking the SDK
   * for its current connection state is the only answer that cannot go stale.
   */
  isRealtime(): boolean {
    return this.subscribed && ( this.pb.realtime?.isConnected ?? false );
  }

  /** How long ago the tracked state was last rebuilt from Beszel, in ms. */
  dataAgeMs(): number {
    return this.lastReconcileAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - this.lastReconcileAt;
  }

  /**
   * Top the tracked state up if it has aged past `maxAgeMs`.
   *
   * Reads call this so a report is never showing whatever the last background
   * sweep left behind — which could be five minutes old when realtime is
   * carrying the load. Cheap when data is already fresh, and it doubles as an
   * extra chance to notice a transition the feed missed.
   */
  async ensureFresh( maxAgeMs: number = FRESHNESS_TARGET_MS ): Promise<void> {
    if ( this.dataAgeMs() <= maxAgeMs ) return;
    await this.reconcile();
  }

  isRunning(): boolean {
    return this.started;
  }

  getKnownStates(): Map<string, TrackedSystem> {
    return new Map( this.lastState );
  }

  /** Suppress alerts for `ms`. State tracking continues regardless. */
  mute( ms: number ): void {
    this.mutedUntil = Date.now() + ms;
  }

  unmute(): void {
    this.mutedUntil = 0;
  }

  isMuted(): boolean {
    return Date.now() < this.mutedUntil;
  }

  /** Ms until alerts resume, or 0 when not muted. */
  muteRemainingMs(): number {
    return this.isMuted() ? this.mutedUntil - Date.now() : 0;
  }

  /**
   * Single entry point for both the realtime feed and the reconcile sweep.
   * A change is held for the debounce window before it is committed, so a
   * flapping host produces one alert rather than a stream of them.
   */
  handleRecord( record: BeszelSystemRecord ): void {
    const id = record.id;
    const status = record.status;
    if ( id == null || id === '' || status == null || status === '' ) return;

    const known = this.lastState.get( id );

    // A system we have not seen before is tracked silently — discovering a
    // host is not the same as that host changing state.
    if ( known == null ) {
      this.lastState.set( id, { name: record.name, status, since: null } );
      return;
    }

    known.name = record.name;

    const queued = this.pending.get( id );

    if ( status === known.status ) {
      // Flapped back inside the debounce window; the alert never happens.
      if ( queued != null ) {
        clearTimeout( queued.timer );
        this.pending.delete( id );
      }
      return;
    }

    if ( queued != null ) {
      if ( queued.status === status ) return;
      clearTimeout( queued.timer );
    }

    const timer = setTimeout( () => {
      this.pending.delete( id );
      void this.commit( id, status );
    }, this.debounceMs );
    timer.unref();

    this.pending.set( id, { status, timer } );
  }

  /**
   * Refresh the full system list. Doubles as the safety net for a dropped
   * realtime socket and as the refresh for LCARS47.BESZEL_SYSTEMS, which
   * /server-status autocomplete reads and which was otherwise only ever
   * populated at boot.
   */
  async reconcile(): Promise<void> {
    try {
      const systems = await beszel_getSystems( this.pb );
      this.client.BESZEL_SYSTEMS = systems;
      this.lastReconcileAt = Date.now();

      for ( const system of systems ) this.handleRecord( system );

      // Forget hosts that have been removed from Beszel entirely.
      const live = new Set( systems.map( s => s.id ) );
      for ( const id of [...this.lastState.keys()] ) {
        if ( live.has( id ) ) continue;
        this.lastState.delete( id );
        const queued = this.pending.get( id );
        if ( queued != null ) {
          clearTimeout( queued.timer );
          this.pending.delete( id );
        }
      }
    }
    catch ( err ) {
      Utility.log( 'warn', `[BESZEL-MON] Reconcile failed: ${ ( err as Error ).message }` );
    }
  }

  private seed( systems: BeszelSystemRecord[] ): void {
    this.lastState.clear();
    for ( const system of systems ) {
      if ( system.id == null || system.id === '' ) continue;
      this.lastState.set( system.id, {
        name: system.name,
        status: system.status,
        since: null
      } );
    }
  }

  private async commit( id: string, status: string ): Promise<void> {
    const known = this.lastState.get( id );
    if ( known == null || known.status === status ) return;

    const previous = known.status;
    const heldSince = known.since;

    this.lastState.set( id, { name: known.name, status, since: Date.now() } );

    if ( this.isMuted() ) {
      Utility.log( 'info', `[BESZEL-MON] ${ known.name }: ${ previous } -> ${ status } (alerts muted)` );
      return;
    }

    Utility.log( 'proc', `[BESZEL-MON] ${ known.name }: ${ previous } -> ${ status }` );

    try {
      await this.sendFn( BeszelMonitor.buildAlertEmbed( known.name, previous, status, heldSince ) );
    }
    catch ( err ) {
      // A monitor must never take the bot down over a failed alert.
      Utility.log( 'warn', `[BESZEL-MON] Alert send failed for ${ known.name }: ${ ( err as Error ).message }` );
    }
  }

  static buildAlertEmbed(
    name: string,
    previous: string,
    current: string,
    heldSince: number | null
  ): EmbedBuilder {
    const headline = STATUS_HEADLINE[current] ?? '🔄 SYSTEM STATE CHANGE';

    return new EmbedBuilder()
      .setTitle( `${ headline } — ${ name }` )
      .setColor( STATUS_COLOUR[current] ?? 0x5865F2 )
      .addFields(
        { name: 'Previous state', value: BeszelMonitor.describeHold( previous, heldSince ), inline: true },
        { name: 'Current state', value: current.toUpperCase(), inline: true }
      )
      .setFooter( { text: `Beszel Monitoring System • Stardate ${ Utility.stardate() }` } )
      .setTimestamp();
  }

  /** "UP (held 4h 12m)", or just "UP" when we never saw it enter that state. */
  static describeHold( status: string, since: number | null ): string {
    if ( since == null ) return status.toUpperCase();
    return `${ status.toUpperCase() } (held ${ formatUptime( Math.floor( ( Date.now() - since ) / 1000 ) ) })`;
  }

  private async getAlertChannel(): Promise<TextChannel | null> {
    if ( this.alertChannel != null ) return this.alertChannel;

    try {
      const ch = await this.client.PLDYN.channels.fetch( this.alertChannelId );
      if ( ch?.isTextBased() ) {
        this.alertChannel = ch as TextChannel;
        return this.alertChannel;
      }
    }
    catch ( err ) {
      Utility.log( 'warn', `[BESZEL-MON] Could not fetch alert channel: ${ String( err ) }` );
    }

    return null;
  }

  private async report( embed: EmbedBuilder ): Promise<void> {
    const ch = await this.getAlertChannel();
    if ( ch == null ) return;
    await ch.send( { embeds: [embed] } );
  }
}

export default BeszelMonitor;
