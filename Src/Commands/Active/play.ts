// -- PLAY --
// Initiates a YouTube audio player stream

//Imports
import {CacheType, CommandInteraction, GuildCacheMessage, GuildMember, TextChannel, VoiceChannel} from 'discord.js';
import {LCARSClient} from "../../Subsystems/Auxiliary/LCARSClient";
import {SlashCommandBuilder} from "@discordjs/builders";
import {PLDYNID, MEDIALOG} from '../../Subsystems/Operations/OPs_IDs.json';
import Utility from "../../Subsystems/Utilities/SysUtils";

import ytdl from 'ytdl-core';
import ytsr from 'ytsr';

import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    DiscordGatewayAdapterCreator,
    entersState, getVoiceConnection,
    joinVoiceChannel,
    StreamType,
    VoiceConnection,
    VoiceConnectionDisconnectReason,
    VoiceConnectionStatus
} from "@discordjs/voice";

import {LCARSMediaPlayer, LCARSMediaSong} from "../../Subsystems/Auxiliary/MediaInterfaces";
import {convertDuration} from "../../Subsystems/Utilities/MediaUtils";

//Functions
const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Fires up an audio stream in your current VC.');

data.addStringOption(o => o.setName('video-query').setDescription('The link or search to play from.').setRequired(true));

let defaultReportChannel: TextChannel;

async function execute(LCARS47: LCARSClient, int: CommandInteraction): Promise<GuildCacheMessage<CacheType>> {
    await int.deferReply();

    let member: GuildMember;
    let vChannel: VoiceChannel;

    defaultReportChannel = await LCARS47.PLDYN.channels.fetch(MEDIALOG) as TextChannel;

    try {
        member = await LCARS47.PLDYN.members.fetch(int.user.id);
    }
    catch (noUserErr) {
        console.log(noUserErr);
        return int.editReply('No user could be found!');
    }

    try {
        if (!member.voice || !member.voice.channel) {
            return int.editReply('You need to be in a voice channel first!');
        }
        else {
            vChannel = member.voice.channel as VoiceChannel;
            Utility.log('info', '[MEDIA-PLAYER] Received new play request for channel: ' + vChannel.name);
        }
    }
    catch (noVChannel) {
        return int.editReply('You need to be in a voice channel first!');
    }

    const ytLink = int.options.getString('video-query') as string;
    const songData = await getBasicInfo(ytLink);

    if (!songData) {
        return int.editReply('Failed to get any song data!');
    }

    const songDuration = parseInt(songData.videoDetails.lengthSeconds);
    const songObj: LCARSMediaSong = {
        info: songData,
        title: songData.videoDetails.title,
        url: songData.videoDetails.video_url,
        duration: songDuration,
        durationFriendly: convertDuration(songDuration),
        member: member
    };

    const mediaQueue = addToMediaQueue(LCARS47, songObj, vChannel);
    if (!mediaQueue.isPlaying) {
        playSong(LCARS47.MEDIA_QUEUE);
    }

    return int.editReply(`Queued **${songObj.title}** (${songObj.durationFriendly})`);
}

async function getBasicInfo(url: string): Promise<ytdl.videoInfo> {
    Utility.log('info', `[MEDIA-PLAYER] Building and parsing song data`);

    let videoUrl = url;
    let songData;

    //No URL, parse for search
    Utility.log('info', `[MEDIA-PLAYER] Doing a search for: ${url}`);
    let searchQuery = null;

    try {
        searchQuery = await ytsr.getFilters(url);
    }
    catch (err) {
        throw 'Song search parsing failure!';
    }

    const videoRes = searchQuery.get("Type")?.get("Video");
    try {
        // @ts-ignore
        const searchRes: any = await ytsr(videoRes.url, {
            limit: 1
        });
        videoUrl = searchRes.items[0].url;
    }
    catch (err) {
        throw `Couldnt actually find a song.\n${err}`;
    }
    finally {
        Utility.log('info', `[MEDIA-PLAYER] Grabbed a song from results with URL: ${videoUrl}`);
    }

    /*
    if (!ytdl.validateURL(url)) {
        //No URL, parse for search
        Utility.log('info', `[MEDIA-PLAYER] Doing a search for: ${url}`);
        let searchQuery = null;

        try {
            searchQuery = await ytsr.getFilters(url);
        }
        catch (err) {
            throw 'Song search parsing failure!';
        }

        const videoRes = searchQuery.get("Type")?.get("Video");
        try {
            // @ts-ignore
            const searchRes: any = await ytsr(videoRes.url, {
                limit: 1
            });
            videoUrl = searchRes.items[0].url;
        }
        catch (err) {
            throw 'Couldnt actually find a song.';
        }
        finally {
            Utility.log('info', `[MEDIA-PLAYER] Grabbed a song from results with URL: ${videoUrl}`);
        }
    }
     */

    try {
        songData = await ytdl.getInfo(videoUrl);
    }
    catch (err) {
        // @ts-ignore
        throw `Error fetching video data.\n${err}\n${err.stack}`;
    }

    return songData;
}

function addToMediaQueue(
    LCARS47: LCARSClient,
    song: LCARSMediaSong,
    vChannel: VoiceChannel
): LCARSMediaPlayer {

    let currentQueue = LCARS47.MEDIA_QUEUE.get(PLDYNID);

    if (!currentQueue) {
        Utility.log('info', '[MEDIA-PLAYER] No queue found, building a new one...');
        currentQueue = {
            voiceChannel: vChannel,
            songs: [],
            player: null,
            playingMsg: null,
            isPlaying: false
        };
        LCARS47.MEDIA_QUEUE.set(PLDYNID, currentQueue);
    }

    Utility.log('info', '[MEDIA-PLAYER] Adding new song to queue...');
    currentQueue.songs.push(song);
    return currentQueue;
}

async function getPlayer(song: LCARSMediaSong): Promise<AudioPlayer> {
    const player = createAudioPlayer();
    const stream = ytdl(song.url, {
        filter: 'audioonly',
        highWaterMark: 1 << 25
    });

    const res = createAudioResource(stream, {
        inputType: StreamType.Arbitrary
    });

    player.play(res);
    return entersState(player, AudioPlayerStatus.Playing, 5_000);
}

async function joinChannel(vChannel: VoiceChannel): Promise<VoiceConnection> {
    Utility.log('info', '[MEDIA-PLAYER] Re/setting channel connection...');
    const playerConnection = joinVoiceChannel({
        channelId: vChannel.id,
        guildId: PLDYNID,
        adapterCreator: vChannel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator //TODO: What is this
    });

    try {
        await entersState(playerConnection, VoiceConnectionStatus.Ready, 30_000);
        playerConnection.on('stateChange', async (_, newState) => {
            if (newState.status === VoiceConnectionStatus.Disconnected) {
                /*
                Weird situation check here, if this socket close code is 4014, wait 5s to determine if the bot
                was kicked or if it changed channels; otherwise, nuke it for simplicity.
                 */
                Utility.log('info', '[MEDIA-PLAYER] Handling a disconnect!');
                if (newState.reason ===
                VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
                    try {
                        await entersState(playerConnection, VoiceConnectionStatus.Connecting, 5_000);
                        Utility.log('info', '[MEDIA-PLAYER] Reconnected.');
                    }
                    catch (disconnected) {
                        playerConnection.destroy();
                    }
                }
                else {
                    playerConnection.destroy();
                }
            }
        });

        return playerConnection;
    }
    catch (playerCreateErr) {
        playerConnection.destroy();
        throw playerCreateErr;
    }
}

async function playSong(queue: Map<string, LCARSMediaPlayer>): Promise<void> {
    const currentQueue = queue.get(PLDYNID);
    if (!currentQueue) {
        return;
    }

    if (currentQueue.songs.length === 0) {
        return handleEmptyQueue(
            queue,
            currentQueue,
        );
    }

    Utility.log('info', '[MEDIA-PLAYER] Starting new/next stream...');
    const song = currentQueue.songs[0];
    const connection = await joinChannel(currentQueue.voiceChannel);
    currentQueue.player = await getPlayer(song);
    connection.subscribe(currentQueue.player);
    currentQueue.isPlaying = true;

    currentQueue.player.on(AudioPlayerStatus.Idle, () => {
        currentQueue.isPlaying = false;
        handleSongEnd(queue, currentQueue);
    });

    sendNowPlaying(currentQueue);
}

async function handleSongEnd(currentQueue: Map<string, LCARSMediaPlayer>, playerQueue: LCARSMediaPlayer): Promise<void> {
    if (playerQueue !== null) {
        playerQueue.songs.shift();
        playSong(currentQueue);
    }
}

function handleEmptyQueue(currentQueue: Map<string, LCARSMediaPlayer>, playerQueue: LCARSMediaPlayer): void {
    Utility.log('info', '[MEDIA-PLAYER] Empty queue list, destroying player.');
    const connection = getVoiceConnection(PLDYNID);
    if (playerQueue.voiceChannel.members.size === 0) {
        connection?.destroy();
        currentQueue.delete(PLDYNID);
        defaultReportChannel.send('*Grumbles to self about streaming music to an empty channel.*');
        return;
    }

    setTimeout(() => {
        if (playerQueue.songs.length === 0) {
            connection?.destroy();
            currentQueue.delete(PLDYNID);
        }
    }, 300000);
}

function sendNowPlaying(playerQueue: LCARSMediaPlayer): void {
    const song = playerQueue.songs[0];
    defaultReportChannel.send(`__Now Playing__\n**${song.title}** (${song.durationFriendly})`);
}

function help(): string {
    return 'Fires up an audio stream in your current VC.';
}

//Exports
export default {
    name: 'Play',
    data,
    execute,
    help,
    handleSongEnd
}