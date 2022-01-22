// -- PLAY --
// Initiates a YouTube audio player stream

//Imports
import {CommandInteraction, GuildMember, TextChannel, VoiceChannel} from 'discord.js';
import {LCARSClient} from "../../Subsystems/Auxiliary/LCARSClient";
import {SlashCommandBuilder} from "@discordjs/builders";
import {PLDYNID, MEDIALOG} from '../../Subsystems/Operations/OPs_Vars.json';
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

data.addStringOption(o => o.setName('yt-link').setDescription('The link to play from.').setRequired(true));

let defaultReportChannel: TextChannel;

async function execute(LCARS47: LCARSClient, int: CommandInteraction): Promise<void> {
    let member: GuildMember;
    let vChannel: VoiceChannel;

    defaultReportChannel = await LCARS47.PLDYN.channels.fetch(MEDIALOG) as TextChannel;

    try {
        member = await LCARS47.PLDYN.members.fetch(int.user.id);
    }
    catch (noUserErr) {
        console.log(noUserErr);
        return int.reply('No user could be found!');
    }

    try {
        if (!member.voice || !member.voice.channel) {
            return int.reply('You need to be in a voice channel first!');
        }
        else {
            vChannel = member.voice.channel as VoiceChannel;
            console.log('Setting vChannel to ' + vChannel.name);
        }
    }
    catch (noVChannel) {
        return int.reply('You need to be in a voice channel first!');
    }

    const ytLink = int.options.getString('yt-link') as string;
    const songData = await getBasicInfo(ytLink);

    if (!songData) {
        return int.reply('Failed to get any song data!');
    }

    console.log('Building song object.');
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

    return int.reply(`Queued **${songObj.title}** (${songObj.durationFriendly})`);
}

async function getBasicInfo(url: string): Promise<ytdl.videoInfo> {
    console.log('Retrieving song data.');

    let videoUrl = url;
    let songData;

    if (!ytdl.validateURL(url)) {
        console.log('No URL specified.');
        //No URL, parse for search
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

        if (!ytdl.validateURL(videoUrl)) {
            throw 'Search URL is invalid.';
        }
    }

    try {
        songData = await ytdl.getInfo(videoUrl);
    }
    catch (err) {
        throw 'Error fetching video data.';
    }

    return songData;
}

function addToMediaQueue(
    LCARS47: LCARSClient,
    song: LCARSMediaSong,
    vChannel: VoiceChannel
): LCARSMediaPlayer {
    console.log('Attempting to add a song to queue.');

    let currentQueue = LCARS47.MEDIA_QUEUE.get(PLDYNID);

    if (!currentQueue) {
        currentQueue = {
            voiceChannel: vChannel,
            songs: [],
            player: null,
            playingMsg: null,
            isPlaying: false
        };
        LCARS47.MEDIA_QUEUE.set(PLDYNID, currentQueue);
    }

    console.log('Pushed a song to queue.');
    currentQueue.songs.push(song);
    return currentQueue;
}

async function getPlayer(song: LCARSMediaSong): Promise<AudioPlayer> {
    console.log('Retrieving player');
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
    console.log('Joining channel.');
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
                console.log('Handling a disconnect...');
                if (newState.reason ===
                VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
                    try {
                        await entersState(playerConnection, VoiceConnectionStatus.Connecting, 5_000);
                        console.log('Reconnected.');
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
    console.log('Executing play song.');
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

function handleSongEnd(currentQueue: Map<string, LCARSMediaPlayer>, playerQueue: LCARSMediaPlayer): void {
    console.log('Handling song end.');
    if (playerQueue !== null) {
        const song = playerQueue.songs[0];
        playerQueue.songs.shift();
        playSong(currentQueue);
    }
}

function handleEmptyQueue(currentQueue: Map<string, LCARSMediaPlayer>, playerQueue: LCARSMediaPlayer): void {
    console.log('Handling empty queue.');
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
    help
}