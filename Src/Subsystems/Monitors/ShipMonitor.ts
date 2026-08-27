// -- ShipMonitor --
// Announces arrivals and tidies the ship's document once a voyage is over.
//
// Deliberately NOT load-bearing. Position in transit is derived from the
// transit plan's timestamps every time anything reads it, so /move status, the
// API and the AI context all report the right answer whether or not this
// monitor ever runs. All it adds is the announcement, and the housekeeping that
// turns an arrived-but-untidied document into a plain idle one.
//
// That also makes it safe: the settle write is what stops a second
// announcement, so a voyage can only ever be announced once, however many times
// the sweep fires or the bot restarts.

import { EmbedBuilder, type TextChannel } from 'discord.js';
import type { MongoClient } from 'mongodb';

import Utility from '../Utilities/SysUtils.js';
import Ship from '../Ship/Ship_Utilities.js';
import Msg from '../Ship/Ship_Messages.js';
import { sectorAddress } from '../Ship/Ship_Navigation.js';
import type { LCARSClient } from '../Auxiliary/LCARSClient.js';
import type { ShipPosition, TransitPlan } from '../Auxiliary/Interfaces/ShipInterfaces.js';

/**
 * Voyages run for real days, so a minute of latency on the announcement is
 * nothing. This interval exists to be cheap, not prompt.
 */
const DEFAULT_POLL_MS = 60_000;

export type ShipAlertSink = ( embed: EmbedBuilder ) => Promise<void>;

export interface ShipMonitorOptions {
  client: LCARSClient;
  connection: MongoClient;
  alertChannelId: string;
  pollIntervalMs?: number;
  /** Injected for tests; defaults to posting into the alert channel. */
  sendFn?: ShipAlertSink;
  /** Injected for tests; defaults to Date.now. */
  nowFn?: () => number;
}

export class ShipMonitor {
  private readonly client: LCARSClient;
  private readonly connection: MongoClient;
  private readonly alertChannelId: string;
  private readonly pollIntervalMs: number;
  private readonly sendFn: ShipAlertSink;
  private readonly now: () => number;

  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private sweeping = false;
  private alertChannel: TextChannel | null = null;

  constructor( opts: ShipMonitorOptions ) {
    this.client = opts.client;
    this.connection = opts.connection;
    this.alertChannelId = opts.alertChannelId;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS;
    this.sendFn = opts.sendFn ?? ( async embed => { await this.report( embed ); } );
    this.now = opts.nowFn ?? ( () => Date.now() );
  }

  /**
   * Begin watching.
   *
   * Unlike the other monitors there is no silent seed: a voyage that finished
   * while the bot was down still finished, and saying so once is the right
   * behaviour. The document write during that first sweep is what guarantees it
   * is only said once.
   */
  async start(): Promise<void> {
    if ( this.started ) return;
    this.started = true;

    await this.sweep();

    this.timer = setInterval( () => { void this.sweep(); }, this.pollIntervalMs );
    this.timer.unref();

    Utility.log(
      'proc',
      `[SHIP-MON] Watching for arrivals every ${ Math.round( this.pollIntervalMs / 1000 ) }s.`
    );
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

  /**
   * One pass: if a voyage has run its course, settle the ship and say so.
   *
   * Overlapping sweeps are skipped rather than queued - the next one is a
   * minute away and will see the same state.
   */
  async sweep(): Promise<void> {
    if ( this.sweeping ) return;
    this.sweeping = true;

    try {
      const doc = await Ship.getShipPosition( this.connection );

      if ( !Ship.arrivalDue( doc, this.now() ) ) {
        this.client.SHIP_POSITION = doc;
        return;
      }

      await this.completeVoyage( doc );
    }
    catch ( err ) {
      // A monitor must never take the bot down over a failed sweep.
      Utility.log( 'warn', `[SHIP-MON] Sweep failed: ${ ( err as Error ).message }` );
    }
    finally {
      this.sweeping = false;
    }
  }

  private async completeVoyage( doc: ShipPosition ): Promise<void> {
    const plan = doc.transit;
    if ( plan == null ) return;

    // Settle first. If the announcement then fails, the voyage is still closed
    // out and the next sweep will not try to announce it again - a missed
    // message beats a repeated one every minute.
    this.client.SHIP_POSITION = await Ship.settleAt(
      this.connection,
      plan.destination,
      'system'
    );

    const sector = sectorAddress( plan.destination );
    Utility.log( 'proc', `[SHIP-MON] Arrived in Sector ${ sector.designation }.` );

    try {
      await this.sendFn( ShipMonitor.buildArrivalEmbed( plan ) );
    }
    catch ( err ) {
      Utility.log( 'warn', `[SHIP-MON] Arrival announcement failed: ${ ( err as Error ).message }` );
    }
  }

  static buildArrivalEmbed( plan: TransitPlan ): EmbedBuilder {
    const sector = sectorAddress( plan.destination );

    return new EmbedBuilder()
      .setTitle( '🛰️ Arrival' )
      .setColor( Msg.COLOUR_ARRIVAL )
      .setDescription( Msg.getArrivalMessage() )
      .addFields(
        { name: 'Position', value: Msg.formatSector( sector ), inline: true },
        {
          name: 'Coordinates',
          value: `\`${ Msg.formatCoordinates( plan.destination ) }\``,
          inline: true
        },
        {
          name: 'Course run',
          value: `${ Msg.formatCourse( plan.bearing, plan.mark ) } · `
            + `${ Ship.voyageDistanceLy( plan ).toFixed( 2 ) } ly at `
            + `${ Msg.formatWarp( plan.warpFactor ) }`,
          inline: false
        },
        {
          name: 'Arrived',
          value: Msg.relativeTimestamp( plan.etaAt ),
          inline: true
        },
        {
          name: 'Elapsed',
          value: Msg.formatDuration(
            plan.etaAt.getTime() - Ship.voyageDepartedAt( plan ).getTime()
          ),
          inline: true
        }
      )
      .setFooter( { text: `Stellar Cartography • Stardate ${ Utility.stardate() }` } )
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
      Utility.log( 'warn', `[SHIP-MON] Could not fetch alert channel: ${ String( err ) }` );
    }

    return null;
  }

  private async report( embed: EmbedBuilder ): Promise<void> {
    const channel = await this.getAlertChannel();
    if ( channel == null ) return;
    await channel.send( { embeds: [embed] } );
  }
}

export default ShipMonitor;
