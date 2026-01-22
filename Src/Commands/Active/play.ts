// -- PLAY --
// Initiates a YouTube audio player stream

// Imports
import {
  type AutocompleteInteraction,
  type CacheType,
  type ChatInputCommandInteraction,
  type GuildCacheMessage,
  type GuildMember,
  type TextChannel,
  type VoiceChannel
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { YtDlp } from 'ytdlp-nodejs';
import { Video, YouTube } from 'youtube-sr';

import {
  type AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  type DiscordGatewayAdapterCreator,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  StreamType,
  type VoiceConnection,
  VoiceConnectionDisconnectReason,
  VoiceConnectionStatus
} from '@discordjs/voice';

import { promisify } from 'util';
import { PassThrough } from 'stream';

import { type LCARSMediaPlayer, type LCARSMediaSong } from '../../Subsystems/Auxiliary/Interfaces/MediaInterfaces.js';
import { convertSecondsToHMS } from '../../Subsystems/Utilities/MediaUtils.js';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { type Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import { getEnv } from '../../Subsystems/Utilities/EnvUtils.js';

// Constants
const env = getEnv();
const PLDYNID = env.PLDYNID;
const MEDIALOG = env.MEDIALOG;

const ytdlp = new YtDlp();

const wait = promisify( setTimeout );

// Functions
const data = new SlashCommandBuilder()
  .setName( 'play' )
  .setDescription( 'Fires up an audio stream in your current VC.' );

data.addStringOption( o => o.setName( 'video-query' ).setDescription( 'The link or search to play from.' ).setRequired( true ) );

let defaultReportChannel: TextChannel;

async function execute ( LCARS47: LCARSClient, int: ChatInputCommandInteraction | AutocompleteInteraction ): Promise<GuildCacheMessage<CacheType> | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    {
      name: 'This command does not support autocomplete.',
      value: 'none'
    }
  ]);

  await int.deferReply();

  defaultReportChannel = await LCARS47.PLDYN.channels.fetch( MEDIALOG ) as TextChannel;

  let member: GuildMember;
  let vChannel: VoiceChannel;

  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch ( noUserErr ) {
    console.log( noUserErr );
    return await int.editReply( 'No user could be found!' );
  }

  try {
    if ( member.voice?.channel == null ) {
      return await int.editReply( 'You need to be in a voice channel first!' );
    }
    else {
      vChannel = member.voice.channel as VoiceChannel;
      Utility.log( 'info', '[MEDIA-PLAYER] Received new play request for channel: ' + vChannel.name );
    }
  }
  catch {
    return await int.editReply( 'You need to be in a voice channel first!' );
  }

  const ytLink = int.options.getString( 'video-query' ) ?? '';

  let data: Video;
  if ( !isYouTubeUrl( ytLink ) ) {
    const searchRes = await YouTube.search( ytLink, { type: 'video' } );
    if ( searchRes.length === 0 ) {
      return await int.editReply( 'No search results found!' );
    }

    data = searchRes[0];
  }
  else {
    data = await YouTube.getVideo( ytLink );
  }

  if ( !data || !data.id || !data.title || !data.duration || !data.url || !data.channel ) {
    return await int.editReply( 'Invalid video data received!' );
  }

  const songDuration = data.duration / 1000 || 1;
  const channelName = data.channel.name ? data.channel.name : 'Unknown Channel';

  const songObj: LCARSMediaSong = {
    info: data,
    title: data.title,
    url: data.url,
    id: data.id,
    duration: songDuration,
    durationFriendly: convertSecondsToHMS( songDuration ),
    member,
    playStart: 0,
    channelName: channelName
  };

  const mediaQueue = addToMediaQueue( LCARS47, songObj, vChannel );
  if ( !mediaQueue.isPlaying ) {
    await playSong( LCARS47.MEDIA_QUEUE );
  }

  Utility.log( 'info', `[MEDIA-PLAYER] Queued - ${songObj.title} (${songObj.durationFriendly})` );
  return await int.editReply( `Queued **${songObj.title}** (${songObj.durationFriendly})` );
}

function isYouTubeUrl ( url: string ): boolean {
  return /^https?:\/\/(www\.)?youtube\.com\/watch\?v=|youtu\.be\//.test(url);
}

function addToMediaQueue (
  LCARS47: LCARSClient,
  song: LCARSMediaSong,
  vChannel: VoiceChannel
): LCARSMediaPlayer {
  let currentQueue = LCARS47.MEDIA_QUEUE.get( PLDYNID );

  if ( currentQueue == null ) {
    Utility.log( 'info', '[MEDIA-PLAYER] No queue found, building a new one...' );
    currentQueue = {
      voiceChannel: vChannel,
      songs: [],
      songStream: null,
      playingMsg: null,
      isPlaying: false
    };
    LCARS47.MEDIA_QUEUE.set( PLDYNID, currentQueue );
  }

  Utility.log( 'info', `[MEDIA-PLAYER] Adding new song (${ song.title }) to queue...` );
  currentQueue.songs.push( song );
  return currentQueue;
}

async function getSongStream( song: LCARSMediaSong ): Promise<AudioPlayer> {
  const player = createAudioPlayer();

  const pt = new PassThrough();

  try {
    const ytStream = ytdlp.stream(
      song.url,
      {
        format: 'bestaudio/best',
        output: '-'
      });
    ytStream.pipe( pt );
  }
  catch ( streamErr ) {
    Utility.log( 'warn', `[MEDIA-PLAYER] Failed to get stream from yt-dlp.\n${ streamErr as string }` );
    throw new Error( 'Failed to get stream from yt-dlp.', { cause: streamErr } );
  }

  const res = createAudioResource( pt, {
    inputType: StreamType.Arbitrary,
    metadata: { title: song.title }
  } );

  player.play( res );
  Utility.log( 'info', '[MEDIA-PLAYER] Starting stream...' );
  // return player;
  return await entersState( player, AudioPlayerStatus.Playing, 10_000 ).catch( ( err ) => {
    Utility.log('warn', '[MEDIA-PLAYER] Stream failed to enter playing state in time.' );
    console.log( err );
    return player;
  } );
}

async function joinChannel ( vChannel: VoiceChannel ): Promise<VoiceConnection | undefined> {
  Utility.log( 'info', '[MEDIA-PLAYER] Re/setting channel connection...' );
  const playerConnection = joinVoiceChannel( {
    channelId: vChannel.id,
    guildId: PLDYNID,
    adapterCreator: vChannel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator
  } );

  try {
    await entersState( playerConnection, VoiceConnectionStatus.Ready, 20_000 );
    playerConnection.on( 'stateChange', ( _, newState ) => {
      void ( async () => {
        Utility.log( 'info', '[MEDIA-PLAYER] Logging a state change.(Old: ' + _.status + ' - New: ' + newState.status + ')' );
        if ( newState.status === VoiceConnectionStatus.Disconnected ) {
          /*
                  Weird situation check here, if this socket close code is 4014, wait 5s to determine if the bot
                  was kicked or if it changed channels; otherwise, nuke it for simplicity.
                   */
          Utility.log( 'info', '[MEDIA-PLAYER] Handling a disconnect!' );
          if ( newState.reason ===
            VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014 ) {
            try {
              await entersState( playerConnection, VoiceConnectionStatus.Connecting, 5_000 );
              Utility.log( 'info', '[MEDIA-PLAYER] Reconnected.' );
            }
            catch {
              playerConnection.destroy();
            }
          }
          else if ( playerConnection.rejoinAttempts < 5 ) {
            await wait( ( playerConnection.rejoinAttempts + 1 ) * 5_000 );
            playerConnection.rejoin();
          }
          else {
            playerConnection.destroy();
          }
        }
      } )();
    } );

    playerConnection.on( 'error', ( e ) => {
      console.log( e );
    } );

    return playerConnection;
  }
  catch ( playerCreateErr ) {
    console.log( 'AudioPlayer Error' );
    console.log( playerCreateErr );
    playerConnection.destroy();
  }
}

async function playSong ( queue: Map<string, LCARSMediaPlayer> ): Promise<void> {
  const currentQueue = queue.get( PLDYNID );
  if ( currentQueue == null ) {
    return;
  }

  if ( currentQueue.songs.length === 0 ) {
    handleEmptyQueue(
      queue,
      currentQueue
    ); return;
  }

  Utility.log( 'info', '[MEDIA-PLAYER] Starting new/next stream...' );
  const song = currentQueue.songs[0];
  currentQueue.songs[0].playStart = Date.now();
  const connection = await joinChannel( currentQueue.voiceChannel );

  if ( connection == null ) {
    console.log( 'No connection!' );
    return;
  }

  Utility.log( 'info', '[MEDIA-PLAYER] Getting stream...' );

  try {
    currentQueue.songStream = await getSongStream( song );
    connection.subscribe( currentQueue.songStream );
    currentQueue.isPlaying = true;
  }
  catch ( e ) {
    console.error( e );

    void handleSongEnd( queue, currentQueue );
    return;
  }

  currentQueue.songStream.on( AudioPlayerStatus.Buffering, () => {
    void defaultReportChannel.send( 'Song Buffering!?' );
  } );

  currentQueue.songStream.on( AudioPlayerStatus.AutoPaused, () => {
    if ( getVoiceConnection( PLDYNID ) != null ) {
      void defaultReportChannel.send( 'Song seems to have halted.' );
    }
  } );

  currentQueue.songStream.on( AudioPlayerStatus.Idle, () => {
    console.log( 'Stream ended?' );
    currentQueue.isPlaying = false;
    void handleSongEnd( queue, currentQueue );
  } );

  sendNowPlaying( currentQueue );
}

export async function handleSongEnd ( currentQueue: Map<string, LCARSMediaPlayer>, playerQueue: LCARSMediaPlayer ): Promise<void> {
  if ( playerQueue.songs.length === 0 ) {
    return;
  }

  playerQueue.songs.shift();
  try {
    await playSong( currentQueue );
  }
  catch ( err ) {
    Utility.log( 'err', `[MEDIA-PLAYER] Unexpected: ${ err as string }`);
  }
}

function handleEmptyQueue ( currentQueue: Map<string, LCARSMediaPlayer>, playerQueue: LCARSMediaPlayer ): void {
  Utility.log( 'info', '[MEDIA-PLAYER] Empty queue list, ending stream.' );
  const connection = getVoiceConnection( PLDYNID );
  if ( playerQueue.voiceChannel.members.size === 0 ) {
    connection?.destroy();
    currentQueue.delete( PLDYNID );
    void defaultReportChannel.send( '*Grumbles to self about streaming music to an empty channel.*' );
    return;
  }

  setTimeout( () => {
    try {
      if ( playerQueue.songs.length === 0 ) {
        connection?.destroy();
        currentQueue.delete( PLDYNID );
      }
    }
    catch ( e ) {
      if ( ( e as string ).includes('Cannot destroy') ) {
        Utility.log( 'warn', '[MEDIA-PLAYER] Connection was already dropped.' );
      }
      else {
        Utility.log( 'warn', `[MEDIA-PLAYER] ${ e as string }` );
      }
    }
  }, 300000 );
}

function sendNowPlaying ( playerQueue: LCARSMediaPlayer ): void {
  const song = playerQueue.songs[0];
  void defaultReportChannel.send( `__Now Playing__\n**${song.title}** (${song.durationFriendly})` );
}

function help (): string {
  return 'Fires up an audio stream in your current VC.';
}

// Exports
export default {
  name: 'Play',
  data,
  execute,
  help
} satisfies Command;
