// -- MediaPlayerService --
// Owns all media-player state for the bot: queues, voice connections, audio
// players, and the lifecycle of currently-playing tracks. Commands delegate
// here instead of mutating shared maps directly.

import {
  type GuildMember,
  type TextChannel,
  type VoiceChannel
} from 'discord.js';
import {
  AudioPlayerStatus,
  type AudioPlayer,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  type VoiceConnection,
  VoiceConnectionDisconnectReason,
  VoiceConnectionStatus
} from '@discordjs/voice';
import { promisify } from 'util';

import { type LCARSClient } from '../Auxiliary/LCARSClient.js';
import { type GuildPlayerState } from './Interfaces/GuildPlayerState.js';
import { type StreamHandle, type Track } from './Interfaces/Track.js';
import { ProviderResolver } from './ProviderResolver.js';
import { YouTubeProvider } from './Providers/YouTubeProvider.js';
import { LocalFileProvider } from './Providers/LocalFileProvider.js';
import { JellyfinProvider } from './Providers/JellyfinProvider.js';
import { type JellyfinClient } from '../Jellyfin/JellyfinClient.js';
import Utility from '../Utilities/SysUtils.js';

const wait = promisify( setTimeout );

const EMPTY_CHANNEL_TIMEOUT_MS = 5 * 60 * 1000;

export interface EnqueueResult {
  ok: true;
  /** Head track — the first item queued in this call (becomes the now-playing
   *  track if playback wasn't already running). */
  track: Track;
  /** Total tracks added by this enqueue. >1 indicates a playlist/album. */
  queuedCount: number;
  startedPlayback: boolean;
}

export interface EnqueueFailure {
  ok: false;
  reason: 'no-results' | 'invalid-data';
}

export type JoinChannelFn = ( vc: VoiceChannel, guildId: string ) => VoiceConnection;

export interface MediaPlayerServiceOptions {
  guildId: string;
  reportChannelId: string;
  joinChannelFn?: JoinChannelFn;
  resolver?: ProviderResolver;
  pathMap?: string;
}

const defaultJoinChannelFn: JoinChannelFn = ( vc, guildId ) => joinVoiceChannel( {
  channelId: vc.id,
  guildId,
  adapterCreator: vc.guild.voiceAdapterCreator
} );

export class MediaPlayerService {
  private readonly client: LCARSClient;
  private readonly guildId: string;
  private readonly reportChannelId: string;
  private readonly joinChannelFn: JoinChannelFn;
  private readonly resolver: ProviderResolver;
  private readonly localProvider: LocalFileProvider;
  private readonly states = new Map<string, GuildPlayerState>();
  private reportChannel: TextChannel | null = null;

  constructor( client: LCARSClient, opts: MediaPlayerServiceOptions ) {
    this.client = client;
    this.guildId = opts.guildId;
    this.reportChannelId = opts.reportChannelId;
    this.joinChannelFn = opts.joinChannelFn ?? defaultJoinChannelFn;
    this.localProvider = new LocalFileProvider( opts.pathMap );
    this.resolver = opts.resolver ?? this.buildDefaultResolver();
  }

  /** Phase-4: register a Jellyfin provider once the client is authenticated.
   *  Inserted ahead of YouTube so library hits beat web hits. */
  attachJellyfin( jellyfin: JellyfinClient ): void {
    const provider = new JellyfinProvider( jellyfin, this.localProvider );
    this.resolver.registerFirst( provider );
  }

  /** Look up a provider by id — used by /jellyfin-search etc. */
  getProvider( id: 'youtube' | 'jellyfin' | 'local' ) {
    return this.resolver.get( id );
  }

  private buildDefaultResolver(): ProviderResolver {
    const r = new ProviderResolver();
    // YouTube is the fallback. Local is registered so MEDIA_PLAYER can open
    // streams for local-sourced tracks (driven by JellyfinProvider).
    r.register( this.localProvider );
    r.register( new YouTubeProvider() );
    return r;
  }

  // ---- Public API ----

  /**
   * Resolves the query, enqueues the resulting track(s), and starts playback
   * if the player is currently idle.
   */
  async enqueue(
    query: string,
    voiceChannel: VoiceChannel,
    requestedBy: GuildMember,
    opts: { expandContainers?: boolean } = {}
  ): Promise<EnqueueResult | EnqueueFailure> {
    const resolved = await this.resolver.resolve( query, requestedBy, opts );
    if ( resolved.tracks.length === 0 || resolved.providerId == null ) {
      return { ok: false, reason: 'no-results' };
    }

    Utility.log(
      'info',
      `[MEDIA-PLAYER] Queued ${ resolved.tracks.length } track(s) from ${ resolved.providerId }; head: ${ resolved.tracks[0].title }`
    );

    return this.pushAndMaybePlay( resolved.tracks, voiceChannel );
  }

  /**
   * Enqueue already-resolved track(s) directly, skipping the resolver. Used
   * when a track has already been produced by an earlier search (e.g. the
   * /search selector) and we just want to queue it. Stamps `requestedBy` onto
   * each track so now-playing/queue attribution reflects who picked it.
   */
  enqueueResolved(
    tracks: Track[],
    voiceChannel: VoiceChannel,
    requestedBy: GuildMember
  ): EnqueueResult | EnqueueFailure {
    if ( tracks.length === 0 ) {
      return { ok: false, reason: 'no-results' };
    }

    const stamped = tracks.map( t => ( { ...t, requestedBy } ) );
    Utility.log(
      'info',
      `[MEDIA-PLAYER] Queued ${ stamped.length } pre-resolved track(s); head: ${ stamped[0].title }`
    );

    return this.pushAndMaybePlay( stamped, voiceChannel );
  }

  /** Shared tail of enqueue/enqueueResolved: append to the queue and start
   *  playback if idle. */
  private pushAndMaybePlay( tracks: Track[], voiceChannel: VoiceChannel ): EnqueueResult {
    const state = this.getOrCreateState( voiceChannel );
    this.clearEmptyTimer( state );
    state.tracks.push( ...tracks );

    let startedPlayback = false;
    if ( !state.isPlaying ) {
      startedPlayback = true;
      void this.playNext();
    }

    return {
      ok: true,
      track: tracks[0],
      queuedCount: tracks.length,
      startedPlayback
    };
  }

  /**
   * Advance the player to the next track. Returns true if a track was
   * skipped (i.e. something was playing or queued).
   */
  async skip(): Promise<boolean> {
    const state = this.states.get( this.guildId );
    if ( state == null || state.tracks.length === 0 ) return false;

    if ( state.audioPlayer != null && state.isPlaying ) {
      // Forcing the player to Idle fires handleTrackFinished, which shifts
      // the current head off and advances to the next track (or drains).
      // We deliberately do NOT shift here — doing so would race with the
      // Idle handler and drop two tracks per skip.
      state.audioPlayer.stop( true );
      return true;
    }

    // No audio player active yet (e.g. enqueue happened but playback never
    // started). Advance the queue manually.
    state.tracks.shift();
    if ( state.tracks.length === 0 ) {
      this.handleQueueDrained( state );
    }
    else {
      await this.playNext();
    }
    return true;
  }

  /**
   * Tear down the player and disconnect from voice. Returns true if there
   * was an active player.
   */
  stop(): boolean {
    const state = this.states.get( this.guildId );
    if ( state == null ) return false;

    this.clearEmptyTimer( state );

    // Detach the Idle / error listeners BEFORE calling stop(true). The
    // audio player emits Idle synchronously from stop(), and our Idle
    // handler would otherwise shift the queue and call playNext — which
    // captures the track reference before its `await` and ends up
    // reporting "Now Playing" for the next track even though we just
    // tore down the connection.
    const player = state.audioPlayer;
    state.audioPlayer = null;
    state.isPlaying = false;
    state.currentStream?.cleanup?.();
    state.currentStream = null;

    if ( player != null ) {
      player.removeAllListeners();
      player.stop( true );
    }

    getVoiceConnection( this.guildId )?.destroy();
    this.states.delete( this.guildId );
    return true;
  }

  getNowPlaying(): Track | null {
    const state = this.states.get( this.guildId );
    if ( state == null || !state.isPlaying || state.tracks.length === 0 ) {
      return null;
    }
    return state.tracks[0];
  }

  getQueue(): Track[] {
    const state = this.states.get( this.guildId );
    return state == null ? [] : [...state.tracks];
  }

  /** True if there is any track tracked (playing or queued). */
  isActive(): boolean {
    const state = this.states.get( this.guildId );
    return state != null && state.tracks.length > 0;
  }

  /** True only if a track is actively streaming. */
  isPlaying(): boolean {
    const state = this.states.get( this.guildId );
    return state != null && state.isPlaying;
  }

  /** The voice channel the player is bound to, if any. */
  getBoundVoiceChannel(): VoiceChannel | null {
    return this.states.get( this.guildId )?.voiceChannel ?? null;
  }

  // ---- Internals ----

  private getOrCreateState( voiceChannel: VoiceChannel ): GuildPlayerState {
    let state = this.states.get( this.guildId );
    if ( state == null ) {
      state = {
        voiceChannel,
        tracks: [],
        audioPlayer: null,
        currentStream: null,
        isPlaying: false,
        emptyTimer: null
      };
      this.states.set( this.guildId, state );
    }
    else {
      state.voiceChannel = voiceChannel;
    }
    return state;
  }

  private async getReportChannel(): Promise<TextChannel | null> {
    if ( this.reportChannel != null ) return this.reportChannel;
    try {
      const ch = await this.client.PLDYN.channels.fetch( this.reportChannelId );
      if ( ch?.isTextBased() ) {
        this.reportChannel = ch as TextChannel;
        return this.reportChannel;
      }
    }
    catch ( err ) {
      Utility.log( 'warn', `[MEDIA-PLAYER] Could not fetch report channel: ${ String( err ) }` );
    }
    return null;
  }

  private async report( message: string ): Promise<void> {
    const ch = await this.getReportChannel();
    if ( ch == null ) return;
    try {
      await ch.send( message );
    }
    catch ( err ) {
      Utility.log( 'warn', `[MEDIA-PLAYER] Report send failed: ${ String( err ) }` );
    }
  }

  private async ensureVoiceConnection( vc: VoiceChannel ): Promise<VoiceConnection | null> {
    Utility.log( 'info', `[MEDIA-PLAYER] Re/setting voice connection: ${ vc.name }` );
    let connection: VoiceConnection;
    try {
      connection = this.joinChannelFn( vc, this.guildId );
    }
    catch ( err ) {
      Utility.log( 'err', `[MEDIA-PLAYER] joinVoiceChannel threw: ${ String( err ) }` );
      return null;
    }

    try {
      await entersState( connection, VoiceConnectionStatus.Ready, 20_000 );
    }
    catch ( err ) {
      Utility.log( 'err', `[MEDIA-PLAYER] Voice connection failed to ready: ${ String( err ) }` );
      connection.destroy();
      return null;
    }

    connection.on( 'stateChange', ( oldState, newState ) => {
      void this.handleConnectionStateChange( connection, oldState.status, newState );
    } );
    connection.on( 'error', ( err ) => {
      Utility.log( 'warn', `[MEDIA-PLAYER] Voice connection error: ${ String( err ) }` );
    } );

    return connection;
  }

  private async handleConnectionStateChange(
    connection: VoiceConnection,
    oldStatus: VoiceConnectionStatus,
    newState: VoiceConnection['state']
  ): Promise<void> {
    Utility.log(
      'info',
      `[MEDIA-PLAYER] Voice state ${ oldStatus } -> ${ newState.status }`
    );
    if ( newState.status !== VoiceConnectionStatus.Disconnected ) return;

    if (
      newState.reason === VoiceConnectionDisconnectReason.WebSocketClose &&
      newState.closeCode === 4014
    ) {
      // Channel-move vs. kicked race: give it 5s to reconnect, else destroy.
      try {
        await entersState( connection, VoiceConnectionStatus.Connecting, 5_000 );
        Utility.log( 'info', '[MEDIA-PLAYER] Reconnected after 4014.' );
      }
      catch {
        connection.destroy();
      }
      return;
    }

    if ( connection.rejoinAttempts < 5 ) {
      await wait( ( connection.rejoinAttempts + 1 ) * 5_000 );
      connection.rejoin();
    }
    else {
      connection.destroy();
    }
  }

  private async openStreamForTrack( track: Track ): Promise<StreamHandle> {
    const provider = this.resolver.get( track.source );
    if ( provider == null ) {
      throw new Error( `No provider registered for source ${ track.source }` );
    }
    return await provider.getStream( track );
  }

  private async playNext(): Promise<void> {
    const state = this.states.get( this.guildId );
    if ( state == null ) return;

    if ( state.tracks.length === 0 ) {
      this.handleQueueDrained( state );
      return;
    }

    const track = state.tracks[0];
    track.playStart = Date.now();

    const connection = await this.ensureVoiceConnection( state.voiceChannel );
    if ( connection == null ) {
      Utility.log( 'err', '[MEDIA-PLAYER] No connection; abandoning track.' );
      state.tracks.shift();
      state.isPlaying = false;
      if ( state.tracks.length > 0 ) {
        void this.playNext();
      }
      else {
        this.handleQueueDrained( state );
      }
      return;
    }

    let handle: StreamHandle;
    try {
      handle = await this.openStreamForTrack( track );
    }
    catch ( err ) {
      Utility.log( 'err', `[MEDIA-PLAYER] Failed to open stream: ${ String( err ) }` );
      state.tracks.shift();
      void this.playNext();
      return;
    }

    const player = this.attachAudioPlayer( state, handle );
    connection.subscribe( player );
    state.isPlaying = true;

    void this.report( `__Now Playing__\n**${ track.title }** (${ track.durationFriendly })` );
  }

  private attachAudioPlayer( state: GuildPlayerState, handle: StreamHandle ): AudioPlayer {
    const player = createAudioPlayer();
    const resource = createAudioResource( handle.stream, {
      inputType: handle.streamType,
      metadata: { title: state.tracks[0]?.title ?? '' }
    } );
    player.play( resource );

    player.on( AudioPlayerStatus.Buffering, () => {
      Utility.log( 'info', '[MEDIA-PLAYER] Buffering.' );
    } );

    player.on( AudioPlayerStatus.AutoPaused, () => {
      if ( getVoiceConnection( this.guildId ) != null ) {
        void this.report( 'Playback auto-paused.' );
      }
    } );

    player.on( AudioPlayerStatus.Idle, () => {
      void this.handleTrackFinished();
    } );

    player.on( 'error', ( err ) => {
      Utility.log( 'warn', `[MEDIA-PLAYER] Audio player error: ${ String( err ) }` );
    } );

    state.audioPlayer = player;
    state.currentStream = handle;
    return player;
  }

  private async handleTrackFinished(): Promise<void> {
    const state = this.states.get( this.guildId );
    if ( state == null ) return;

    state.currentStream?.cleanup?.();
    state.currentStream = null;
    state.isPlaying = false;
    state.tracks.shift();

    if ( state.tracks.length === 0 ) {
      this.handleQueueDrained( state );
      return;
    }

    await this.playNext();
  }

  private handleQueueDrained( state: GuildPlayerState ): void {
    Utility.log( 'info', '[MEDIA-PLAYER] Queue drained.' );
    const connection = getVoiceConnection( this.guildId );

    if ( state.voiceChannel.members.size === 0 ) {
      connection?.destroy();
      this.states.delete( this.guildId );
      void this.report( '*Grumbles to self about streaming music to an empty channel.*' );
      return;
    }

    this.clearEmptyTimer( state );
    state.emptyTimer = setTimeout( () => {
      try {
        const fresh = this.states.get( this.guildId );
        if ( fresh != null && fresh.tracks.length === 0 ) {
          connection?.destroy();
          this.states.delete( this.guildId );
        }
      }
      catch ( err ) {
        const msg = String( err );
        if ( msg.includes( 'Cannot destroy' ) ) {
          Utility.log( 'warn', '[MEDIA-PLAYER] Connection was already dropped.' );
        }
        else {
          Utility.log( 'warn', `[MEDIA-PLAYER] Empty-timer error: ${ msg }` );
        }
      }
    }, EMPTY_CHANNEL_TIMEOUT_MS );
  }

  private clearEmptyTimer( state: GuildPlayerState ): void {
    if ( state.emptyTimer != null ) {
      clearTimeout( state.emptyTimer );
      state.emptyTimer = null;
    }
  }
}
