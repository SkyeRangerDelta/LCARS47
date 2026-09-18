// -- AMPMonitor --
// Watches running game servers and says something when one dies.
//
// The Beszel monitor covers whether a *host* is up. Nothing covered whether the
// game servers on it are, so a Minecraft server crashing at 03:00 went unnoticed
// until someone tried to join. This closes that gap.
//
// Polling, not realtime: AMP has no push channel, so state is sampled. The cost
// is deliberately small — only instances that are actually running get probed,
// which is a handful, and each probe is one request against a session that is
// already open. Probing also keeps those sessions alive as a side effect, since
// AMP's idle timeout is comfortably over ten minutes and every poll resets it.

import { EmbedBuilder, type TextChannel } from 'discord.js';

import Utility from '../Utilities/SysUtils.js';
import { AMPError, type AMPClient } from '../AMP/AMPClient.js';
import { stateLabel } from '../AMP/AMPFormat.js';
import type { AMPInstance } from '../AMP/AMPInterfaces.js';
import type { LCARSClient } from '../Auxiliary/LCARSClient.js';

const DEFAULT_POLL_INTERVAL_MS = 60_000;

/**
 * How long after an operator action a state change is still attributed to it.
 *
 * A deliberate stop is not a crash, and the state usually settles a moment after
 * the command releases its lock. Anything inside this window is treated as
 * intended rather than alarming.
 */
const ACTION_GRACE_MS = 2 * 60_000;

/** Application states meaning the server is up, or on its way up. */
const LIVE_STATES = new Set( [5, 10, 20] );

/** Sentinel for "the instance daemon did not answer at all". */
const UNREACHABLE = null;

export type AlertKind = 'crashed' | 'stopped' | 'offline' | 'recovered';

export type AMPAlertSink = ( embed: EmbedBuilder ) => Promise<void>;

export interface TrackedServer {
  name: string;
  /** Application state, or null when the instance itself was unreachable. */
  state: number | null;
  since: number;
  /** Consecutive unreachable samples, used to confirm before crying wolf. */
  missedSamples: number;
}

export interface AMPMonitorOptions {
  client: LCARSClient;
  amp: AMPClient;
  alertChannelId: string;
  pollIntervalMs?: number;
  /** Injected for tests; defaults to posting into the alert channel. */
  sendFn?: AMPAlertSink;
}

const ALERT_HEADLINE: Readonly<Record<AlertKind, string>> = {
  crashed: '💥 SERVER CRASHED',
  stopped: '⚠️ SERVER STOPPED UNEXPECTEDLY',
  offline: '⚠️ INSTANCE WENT OFFLINE',
  recovered: '✅ SERVER RECOVERED'
};

const ALERT_COLOUR: Readonly<Record<AlertKind, number>> = {
  crashed: 0xFF0000,
  stopped: 0xFFA500,
  offline: 0xFF0000,
  recovered: 0x00FF00
};

/**
 * Which transitions deserve an alert.
 *
 * Only changes *away from* a live server are alarming, plus the recovery that
 * follows one. A server moving between two idle states is housekeeping, and a
 * recovery is only news if we reported the fall.
 */
export function classifyTransition(
  wasLive: boolean,
  previous: number | null,
  current: number | null
): AlertKind | null {
  if ( current === 100 ) return 'crashed';

  if ( wasLive && current === UNREACHABLE ) return 'offline';
  if ( wasLive && ( current === 0 || current === 50 ) ) return 'stopped';

  const wasBad = previous === 100 || previous === UNREACHABLE;
  if ( wasBad && current === 20 ) return 'recovered';

  return null;
}

export function describeState( state: number | null ): string {
  return state === UNREACHABLE ? 'Offline' : stateLabel( state );
}

function formatDuration( ms: number ): string {
  const minutes = Math.floor( ms / 60_000 );
  if ( minutes < 1 ) return '< 1m';
  if ( minutes < 60 ) return `${ minutes }m`;

  const hours = Math.floor( minutes / 60 );
  const rest = minutes % 60;
  return rest === 0 ? `${ hours }h` : `${ hours }h ${ rest }m`;
}

export class AMPMonitor {
  private readonly client: LCARSClient;
  private readonly amp: AMPClient;
  private readonly alertChannelId: string;
  private readonly pollIntervalMs: number;
  private readonly sendFn: AMPAlertSink;

  private readonly tracked = new Map<string, TrackedServer>();

  private alertChannel: TextChannel | null = null;
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private polling = false;
  private lastPollAt = 0;
  private mutedUntil = 0;

  constructor( opts: AMPMonitorOptions ) {
    this.client = opts.client;
    this.amp = opts.amp;
    this.alertChannelId = opts.alertChannelId;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.sendFn = opts.sendFn ?? ( async embed => { await this.report( embed ); } );
  }

  /**
   * Seed current state, then start sampling. The seed emits nothing — a bot
   * restart is not a crash, and a server that was already down before we
   * started watching is not news.
   */
  async start(): Promise<void> {
    if ( this.started ) return;
    this.started = true;

    await this.poll( { seed: true } );

    this.timer = setInterval( () => { void this.poll(); }, this.pollIntervalMs );
    this.timer.unref();

    Utility.log( 'proc',
      `[AMP-MON] Watching ${ this.tracked.size } running game servers`
      + ` every ${ Math.round( this.pollIntervalMs / 1000 ) }s.` );
  }

  stop(): void {
    if ( this.timer != null ) {
      clearInterval( this.timer );
      this.timer = null;
    }
    this.started = false;
  }

  isRunning(): boolean {
    return this.started;
  }

  getTracked(): Map<string, TrackedServer> {
    return new Map( this.tracked );
  }

  dataAgeMs(): number {
    return this.lastPollAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - this.lastPollAt;
  }

  mute( ms: number ): void {
    this.mutedUntil = Date.now() + ms;
  }

  unmute(): void {
    this.mutedUntil = 0;
  }

  isMuted(): boolean {
    return Date.now() < this.mutedUntil;
  }

  muteRemainingMs(): number {
    return this.isMuted() ? this.mutedUntil - Date.now() : 0;
  }

  /**
   * Sample every running instance once.
   *
   * Overlapping sweeps are skipped rather than queued: if one is slow because
   * AMP is struggling, piling more concurrent probes onto it is the worst
   * available response.
   */
  async poll( opts: { seed?: boolean } = {} ): Promise<void> {
    if ( this.polling ) return;
    this.polling = true;

    try {
      const instances = await this.amp.listInstances();
      const watchable = instances.filter( i => i.running );

      // Sequential on purpose. A parallel fan-out is what tripped AMP's
      // brute-force protection before, and nothing here is time-critical.
      for ( const instance of watchable ) {
        await this.sample( instance, opts.seed === true );
      }

      // Forget anything no longer running — an instance that is deliberately
      // offline is not something to keep reporting on.
      const live = new Set( watchable.map( i => i.instanceId ) );
      for ( const id of [...this.tracked.keys()] ) {
        if ( !live.has( id ) ) this.tracked.delete( id );
      }

      this.lastPollAt = Date.now();
    }
    catch ( err ) {
      if ( err instanceof AMPError && err.kind === 'rate-limited' ) {
        Utility.log( 'warn', '[AMP-MON] Skipping sweep; AMP is throttling logins.' );
        return;
      }
      Utility.log( 'warn', `[AMP-MON] Sweep failed: ${ ( err as Error ).message }` );
    }
    finally {
      this.polling = false;
    }
  }

  private async sample( instance: AMPInstance, seed: boolean ): Promise<void> {
    let state: number | null;

    try {
      const status = await this.amp.probeInstance( instance );
      state = status == null ? UNREACHABLE : status.state;
    }
    catch ( err ) {
      if ( err instanceof AMPError && err.kind === 'rate-limited' ) throw err;
      // A single failed probe is not evidence of anything.
      Utility.log( 'warn', `[AMP-MON] Probe failed for ${ instance.friendlyName }: ${ ( err as Error ).message }` );
      return;
    }

    const known = this.tracked.get( instance.instanceId );

    if ( known == null || seed ) {
      this.remember( instance, state );
      return;
    }

    known.name = instance.friendlyName;

    if ( state === known.state ) {
      known.missedSamples = 0;
      return;
    }

    // An unreachable instance may just be a blip in the proxy, so require a
    // second consecutive miss before declaring it. AMP reporting a definite
    // state is authoritative and needs no confirmation.
    if ( state === UNREACHABLE ) {
      known.missedSamples++;
      if ( known.missedSamples < 2 ) return;
    }

    const previous = known.state;
    const heldFor = Date.now() - known.since;

    this.remember( instance, state );
    await this.evaluate( instance, previous, state, heldFor );
  }

  private remember( instance: AMPInstance, state: number | null ): void {
    this.tracked.set( instance.instanceId, {
      name: instance.friendlyName,
      state,
      since: Date.now(),
      missedSamples: 0
    } );
  }

  /** Decide whether a transition is worth waking anyone up for. */
  private async evaluate(
    instance: AMPInstance,
    previous: number | null,
    current: number | null,
    heldFor: number
  ): Promise<void> {
    const transition = `${ describeState( previous ) } -> ${ describeState( current ) }`;

    // Anything an operator asked for is not a crash, however alarming it looks.
    if ( this.amp.recentlyActedOn( instance, ACTION_GRACE_MS ) ) {
      Utility.log( 'info', `[AMP-MON] ${ instance.friendlyName }: ${ transition } (operator action)` );
      return;
    }

    const wasLive = previous != null && LIVE_STATES.has( previous );
    const kind = classifyTransition( wasLive, previous, current );
    if ( kind == null ) return;

    Utility.log( 'proc', `[AMP-MON] ${ instance.friendlyName }: ${ transition } (${ kind })` );

    if ( this.isMuted() ) return;

    try {
      await this.sendFn(
        AMPMonitor.buildAlertEmbed( instance.friendlyName, previous, current, heldFor, kind )
      );
    }
    catch ( err ) {
      // A monitor must never take the bot down over a failed alert.
      Utility.log( 'warn', `[AMP-MON] Alert send failed for ${ instance.friendlyName }: ${ ( err as Error ).message }` );
    }
  }

  static buildAlertEmbed(
    name: string,
    previous: number | null,
    current: number | null,
    heldFor: number,
    kind: AlertKind
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle( `${ ALERT_HEADLINE[kind] } — ${ name }` )
      .setColor( ALERT_COLOUR[kind] )
      .addFields(
        {
          name: 'Was',
          value: `${ describeState( previous ) } (for ${ formatDuration( heldFor ) })`,
          inline: true
        },
        { name: 'Now', value: describeState( current ), inline: true }
      )
      .setFooter( { text: `AMP Server Monitor • Stardate ${ Utility.stardate() }` } )
      .setTimestamp();
  }

  private async getAlertChannel(): Promise<TextChannel | null> {
    if ( this.alertChannel != null ) return this.alertChannel;

    try {
      const channel = await this.client.PLDYN.channels.fetch( this.alertChannelId );
      if ( channel?.isTextBased() ) {
        this.alertChannel = channel as TextChannel;
        return this.alertChannel;
      }
    }
    catch ( err ) {
      Utility.log( 'warn', `[AMP-MON] Could not fetch alert channel: ${ String( err ) }` );
    }

    return null;
  }

  private async report( embed: EmbedBuilder ): Promise<void> {
    const channel = await this.getAlertChannel();
    if ( channel == null ) return;
    await channel.send( { embeds: [embed] } );
  }
}

export default AMPMonitor;
