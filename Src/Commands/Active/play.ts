// -- PLAY --
// Initiates a YouTube audio player stream

//Imports
import {
    CacheType,
    ChatInputCommandInteraction,
    GuildCacheMessage,
    GuildMember,
    TextChannel,
    VoiceChannel
} from 'discord.js';
import {LCARSClient} from "../../Subsystems/Auxiliary/LCARSClient.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import Utility from "../../Subsystems/Utilities/SysUtils.js";

const PLDYNID = process.env.PLDYNID as string;
const MEDIALOG = process.env.MEDIALOG as string;

import ytdl from 'ytdl-core';
import ytsr from 'ytsr';

import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    DiscordGatewayAdapterCreator,
    entersState,
    getVoiceConnection,
    joinVoiceChannel,
    StreamType,
    VoiceConnection,
    VoiceConnectionDisconnectReason,
    VoiceConnectionStatus
} from "@discordjs/voice";

import {LCARSMediaPlayer, LCARSMediaSong} from "../../Subsystems/Auxiliary/MediaInterfaces.js";
import { convertDuration } from "../../Subsystems/Utilities/MediaUtils.js";

import { promisify } from "util";
const wait = promisify(setTimeout);

//Functions
const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Fires up an audio stream in your current VC.');

data.addStringOption(o => o.setName('video-query').setDescription('The link or search to play from.').setRequired(true));

let defaultReportChannel: TextChannel;

async function execute(LCARS47: LCARSClient, int: ChatInputCommandInteraction): Promise<GuildCacheMessage<CacheType>> {
    await int.deferReply();

    defaultReportChannel = await LCARS47.PLDYN.channels.fetch(MEDIALOG) as TextChannel;

    let member: GuildMember;
    let vChannel: VoiceChannel;

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

    const ytLink = int.options.getString('video-query') ?? '';

    const validSong = determineSong(ytLink);
    let songData: ytdl.videoInfo;
    if (!validSong) {
        return int.editReply('Failed to get any song data!');
    }
    else {
        songData = await getBasicInfo(ytLink);
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

    const mediaQueue = await addToMediaQueue(LCARS47, songObj, vChannel);
    if (!mediaQueue.isPlaying) {
        playSong(LCARS47.MEDIA_QUEUE);
    }

    Utility.log('info', `[MEDIA-PLAYER] Queued - ${songObj.title} (${songObj.durationFriendly})`);
    return int.editReply(`Queued **${songObj.title}** (${songObj.durationFriendly})`);
}

async function determineSong(url: string): Promise<boolean> {
    Utility.log('info', '[MEDIA-PLAYER] Determine validity...');
    if (ytdl.validateURL(url)) {
        Utility.log('info', '[MEDIA-PLAYER] Identified a song from url.');
        return true;
    }
    else {
        //Do search
        try {
            const filter1 = await ytsr.getFilters(url);
            // @ts-ignore
            const filter1r = filter1.get('Type').get('Video');
            // @ts-ignore
            const songDataRes = await ytsr(filter1r.url, {pages: 1});
            if (songDataRes.results != 0) {
                Utility.log('info', `[MEDIA-PLAYER] ${songDataRes.results} were found from a general search, sending song data.`);
                return true;
            }
        }
        catch (searchErr) {
            Utility.log('err', `[MEDIA-PLAYER] Hit a determination snag/search err.\n${searchErr}`);
            return false;
        }
    }

    return false;
}

async function getBasicInfo(url: string): Promise<ytdl.videoInfo> {
    Utility.log('info', `[MEDIA-PLAYER] Building and parsing song data`);

    const videoUrl = url;
    let songData;

    //Validate
    if (ytdl.validateURL(videoUrl)) {
        try {
            songData = await ytdl.getInfo(videoUrl);
        }
        catch (noDataErr) {
            throw 'Invalid URL?';
        }
    }
    else {
        try {
            //Search
            const filter1 = await ytsr.getFilters(videoUrl);
            const filter1r = filter1.get('Type')!.get('Video')!;
            // @ts-ignore
            const songDataRes = await ytsr(filter1r.url, {limit: 1});
            // @ts-ignore
            songData = await ytdl.getInfo(songDataRes.items[0].url);
        }
        catch (e) {
            throw 'Not able to parse the song search - probably YTSR being a retard again.';
        }
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
            songStream: null,
            playingMsg: null,
            isPlaying: false
        };
        LCARS47.MEDIA_QUEUE.set(PLDYNID, currentQueue);
    }

    Utility.log('info', '[MEDIA-PLAYER] Adding new song to queue...');
    currentQueue.songs.push(song);
    return currentQueue;
}

async function getSongStream(song: LCARSMediaSong): Promise<AudioPlayer> {
    const player = createAudioPlayer();
    const stream = ytdl(song.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25
    });

    const res = createAudioResource(stream, {
        inputType: StreamType.Arbitrary
    });

    player.play(res);
    Utility.log('info', '[MEDIA-PLAYER] Starting stream.');
    return entersState(player, AudioPlayerStatus.Playing, 7_000);
}

async function joinChannel(vChannel: VoiceChannel): Promise<VoiceConnection | undefined> {
    Utility.log('info', '[MEDIA-PLAYER] Re/setting channel connection...');
    const playerConnection = joinVoiceChannel({
        channelId: vChannel.id,
        guildId: PLDYNID,
        adapterCreator: vChannel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator //TODO: What is this
    });

    try {
        await entersState(playerConnection, VoiceConnectionStatus.Ready, 20_000);
        playerConnection.on('stateChange', async (_, newState) => {
            Utility.log('info', '[MEDIA-PLAYER] Logging a state change.(Old: ' + _.status + ' - New: ' + newState.status + ')');
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
                else if (playerConnection.rejoinAttempts < 5) {
                    await wait((playerConnection.rejoinAttempts +1) * 5_000);
                    playerConnection.rejoin();
                }
                else {
                    playerConnection.destroy();
                }
            }
        });

        playerConnection.on('error', (e) => {
            console.log(e);
        });

        return playerConnection;
    }
    catch (playerCreateErr) {
        console.log('AudioPlayer Error');
        console.log(playerCreateErr);
        playerConnection.destroy();
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

    if (!connection) {
        console.log('No connection!');
        return;
    }

    Utility.log('info', '[MEDIA-PLAYER] Getting stream...');
    currentQueue.songStream = await getSongStream(song);
    await connection.subscribe(currentQueue.songStream);
    currentQueue.isPlaying = true;

    currentQueue.songStream.on(AudioPlayerStatus.Buffering, () => {
        defaultReportChannel.send(`Song Buffering!?`);
    });

    currentQueue.songStream.on(AudioPlayerStatus.AutoPaused, () => {
        if (getVoiceConnection(PLDYNID)) {
            defaultReportChannel.send(`Song seems to have halted.`);
        }
    });

    currentQueue.songStream.on(AudioPlayerStatus.Idle, () => {
        console.log('Stream ended?')
        currentQueue.isPlaying = false;
        handleSongEnd(queue, currentQueue);
    });

    sendNowPlaying(currentQueue);
}

async function handleSongEnd(currentQueue: Map<string, LCARSMediaPlayer>, playerQueue: LCARSMediaPlayer): Promise<void> {
    if (playerQueue.songs.length === 0) {
        return;
    }

    playerQueue.songs.shift();
    try {
        playSong(currentQueue);
    }
    catch (err) {
        Utility.log('err', '[MEDIA-PLAYER] Unexpected:\n' + err);
    }
}

function handleEmptyQueue(currentQueue: Map<string, LCARSMediaPlayer>, playerQueue: LCARSMediaPlayer): void {
    Utility.log('info', '[MEDIA-PLAYER] Empty queue list, ending stream.');
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