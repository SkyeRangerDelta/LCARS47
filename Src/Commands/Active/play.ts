// -- PLAY --
// Initiates a YouTube audio player stream

// Imports
import {
  type CacheType,
  type ChatInputCommandInteraction,
  type GuildCacheMessage,
  type GuildMember,
  type TextChannel,
  type VoiceChannel
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import ytdl from 'ytdl-core';
import ytsr from '@distube/ytsr';

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

import { type LCARSMediaPlayer, type LCARSMediaSong } from '../../Subsystems/Auxiliary/MediaInterfaces.js';
import { convertDuration } from '../../Subsystems/Utilities/MediaUtils.js';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { NoSongErr } from '../../Errors/NoSong.js';
import { type Command } from '../../Subsystems/Auxiliary/CommandInterface';

let PLDYNID: string;
let MEDIALOG: string;

if ( process.env.PLDYNID == null || process.env.MEDIALOG == null ) {
  throw new Error( 'Missing environment variables!' );
}
else {
  PLDYNID = process.env.PLDYNID;
  MEDIALOG = process.env.MEDIALOG;
}

const wait = promisify( setTimeout );

// Functions
const data = new SlashCommandBuilder()
  .setName( 'play' )
  .setDescription( 'Fires up an audio stream in your current VC.' );

data.addStringOption( o => o.setName( 'video-query' ).setDescription( 'The link or search to play from.' ).setRequired( true ) );

let defaultReportChannel: TextChannel;

async function execute ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<GuildCacheMessage<CacheType>> {
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
  catch ( noVChannel ) {
    return await int.editReply( 'You need to be in a voice channel first!' );
  }

  const ytLink = int.options.getString( 'video-query' ) ?? '';

  const validSong = await determineSong( ytLink );
  let songData: ytdl.videoInfo | null;
  if ( !validSong ) {
    return await int.editReply( 'Failed to get any song data!' );
  }
  else {
    songData = await getBasicInfo( ytLink );
    if ( songData == null ) {
      return await int.editReply( 'Failed to get any song data!' );
    }
  }

  const songDuration = parseInt( songData.videoDetails.lengthSeconds );
  const songObj: LCARSMediaSong = {
    info: songData,
    title: songData.videoDetails.title,
    url: songData.videoDetails.video_url,
    duration: songDuration,
    durationFriendly: convertDuration( songDuration ),
    member
  };

  const mediaQueue = addToMediaQueue( LCARS47, songObj, vChannel );
  if ( !mediaQueue.isPlaying ) {
    await playSong( LCARS47.MEDIA_QUEUE );
  }

  Utility.log( 'info', `[MEDIA-PLAYER] Queued - ${songObj.title} (${songObj.durationFriendly})` );
  return await int.editReply( `Queued **${songObj.title}** (${songObj.durationFriendly})` );
}

async function determineSong ( url: string ): Promise<boolean> {
  Utility.log( 'info', '[MEDIA-PLAYER] Determine validity...' );
  if ( ytdl.validateURL( url ) ) {
    Utility.log( 'info', '[MEDIA-PLAYER] Identified a song from url.' );
    return true;
  }
  else {
    // Do search
    try {
      const searchResults = await ytsr( url, { limit: 1 } );

      if ( searchResults.results !== 0 ) {
        Utility.log( 'info', `[MEDIA-PLAYER] ${searchResults.results} were found from a general search, sending song data.` );
        return true;
      }
    }
    catch ( searchErr: any ) {
      Utility.log( 'err', `[MEDIA-PLAYER] Hit a determination snag/search err.\n ${searchErr}` );
      return false;
    }
  }

  return false;
}

async function getBasicInfo ( url: string ): Promise<ytdl.videoInfo | null> {
  Utility.log( 'info', '[MEDIA-PLAYER] Building and parsing song data' );

  const videoUrl = url;
  let songData: ytdl.videoInfo;

  // Validate
  if ( ytdl.validateURL( videoUrl ) ) {
    try {
      songData = await ytdl.getInfo( videoUrl );
    }
    catch ( noDataErr ) {
      throw new NoSongErr( 'Invalid URL?' );
    }
  }
  else {
    try {
      const searchResults = await ytsr( url, { limit: 1 } );
      songData = await ytdl.getInfo( searchResults.items[0].url );
    }
    catch ( searchErr: any ) {
      Utility.log( 'err', `[MEDIA-PLAYER] Hit a determination snag/search err.\n ${searchErr}` );
      return null;
    }
  }

  return songData;
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

  Utility.log( 'info', '[MEDIA-PLAYER] Adding new song to queue...' );
  currentQueue.songs.push( song );
  return currentQueue;
}

async function getSongStream ( song: LCARSMediaSong ): Promise<AudioPlayer> {
  const player = createAudioPlayer();
  const stream = ytdl( song.url, {
    filter: 'audioonly',
    quality: 'highestaudio',
    highWaterMark: 1 << 25
  } );

  const res = createAudioResource( stream, {
    inputType: StreamType.Arbitrary
  } );

  player.play( res );
  Utility.log( 'info', '[MEDIA-PLAYER] Starting stream.' );
  return await entersState( player, AudioPlayerStatus.Playing, 7_000 );
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
            catch ( disconnected ) {
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
  const connection = await joinChannel( currentQueue.voiceChannel );

  if ( connection == null ) {
    console.log( 'No connection!' );
    return;
  }

  Utility.log( 'info', '[MEDIA-PLAYER] Getting stream...' );
  currentQueue.songStream = await getSongStream( song );
  connection.subscribe( currentQueue.songStream );
  currentQueue.isPlaying = true;

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
  catch ( err: any ) {
    Utility.log( 'err', '[MEDIA-PLAYER] Unexpected:\n' + err );
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
    if ( playerQueue.songs.length === 0 ) {
      connection?.destroy();
      currentQueue.delete( PLDYNID );
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
