"use strict";
// -- PLAY --
// Initiates a YouTube audio player stream
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const OPs_IDs_json_1 = require("../../Subsystems/Operations/OPs_IDs.json");
const ytdl_core_1 = __importDefault(require("ytdl-core"));
const ytsr_1 = __importDefault(require("ytsr"));
const voice_1 = require("@discordjs/voice");
const MediaUtils_1 = require("../../Subsystems/Utilities/MediaUtils");
//Functions
const data = new builders_1.SlashCommandBuilder()
    .setName('play')
    .setDescription('Fires up an audio stream in your current VC.');
data.addStringOption(o => o.setName('yt-link').setDescription('The link to play from.').setRequired(true));
let defaultReportChannel;
async function execute(LCARS47, int) {
    let member;
    let vChannel;
    defaultReportChannel = await LCARS47.PLDYN.channels.fetch(OPs_IDs_json_1.MEDIALOG);
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
            vChannel = member.voice.channel;
            console.log('Setting vChannel to ' + vChannel.name);
        }
    }
    catch (noVChannel) {
        return int.reply('You need to be in a voice channel first!');
    }
    const ytLink = int.options.getString('yt-link');
    const songData = await getBasicInfo(ytLink);
    if (!songData) {
        return int.reply('Failed to get any song data!');
    }
    console.log('Building song object.');
    const songDuration = parseInt(songData.videoDetails.lengthSeconds);
    const songObj = {
        info: songData,
        title: songData.videoDetails.title,
        url: songData.videoDetails.video_url,
        duration: songDuration,
        durationFriendly: (0, MediaUtils_1.convertDuration)(songDuration),
        member: member
    };
    const mediaQueue = addToMediaQueue(LCARS47, songObj, vChannel);
    if (!mediaQueue.isPlaying) {
        playSong(LCARS47.MEDIA_QUEUE);
    }
    return int.reply(`Queued **${songObj.title}** (${songObj.durationFriendly})`);
}
async function getBasicInfo(url) {
    console.log('Retrieving song data.');
    let videoUrl = url;
    let songData;
    if (!ytdl_core_1.default.validateURL(url)) {
        console.log('No URL specified.');
        //No URL, parse for search
        let searchQuery = null;
        try {
            searchQuery = await ytsr_1.default.getFilters(url);
        }
        catch (err) {
            throw 'Song search parsing failure!';
        }
        const videoRes = searchQuery.get("Type")?.get("Video");
        try {
            // @ts-ignore
            const searchRes = await (0, ytsr_1.default)(videoRes.url, {
                limit: 1
            });
            videoUrl = searchRes.items[0].url;
        }
        catch (err) {
            throw 'Couldnt actually find a song.';
        }
        if (!ytdl_core_1.default.validateURL(videoUrl)) {
            throw 'Search URL is invalid.';
        }
    }
    try {
        songData = await ytdl_core_1.default.getInfo(videoUrl);
    }
    catch (err) {
        throw 'Error fetching video data.';
    }
    return songData;
}
function addToMediaQueue(LCARS47, song, vChannel) {
    console.log('Attempting to add a song to queue.');
    let currentQueue = LCARS47.MEDIA_QUEUE.get(OPs_IDs_json_1.PLDYNID);
    if (!currentQueue) {
        currentQueue = {
            voiceChannel: vChannel,
            songs: [],
            player: null,
            playingMsg: null,
            isPlaying: false
        };
        LCARS47.MEDIA_QUEUE.set(OPs_IDs_json_1.PLDYNID, currentQueue);
    }
    console.log('Pushed a song to queue.');
    currentQueue.songs.push(song);
    return currentQueue;
}
async function getPlayer(song) {
    console.log('Retrieving player');
    const player = (0, voice_1.createAudioPlayer)();
    const stream = (0, ytdl_core_1.default)(song.url, {
        filter: 'audioonly',
        highWaterMark: 1 << 25
    });
    const res = (0, voice_1.createAudioResource)(stream, {
        inputType: voice_1.StreamType.Arbitrary
    });
    player.play(res);
    return (0, voice_1.entersState)(player, voice_1.AudioPlayerStatus.Playing, 5_000);
}
async function joinChannel(vChannel) {
    console.log('Joining channel.');
    const playerConnection = (0, voice_1.joinVoiceChannel)({
        channelId: vChannel.id,
        guildId: OPs_IDs_json_1.PLDYNID,
        adapterCreator: vChannel.guild.voiceAdapterCreator //TODO: What is this
    });
    try {
        await (0, voice_1.entersState)(playerConnection, voice_1.VoiceConnectionStatus.Ready, 30_000);
        playerConnection.on('stateChange', async (_, newState) => {
            if (newState.status === voice_1.VoiceConnectionStatus.Disconnected) {
                /*
                Weird situation check here, if this socket close code is 4014, wait 5s to determine if the bot
                was kicked or if it changed channels; otherwise, nuke it for simplicity.
                 */
                console.log('Handling a disconnect...');
                if (newState.reason ===
                    voice_1.VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
                    try {
                        await (0, voice_1.entersState)(playerConnection, voice_1.VoiceConnectionStatus.Connecting, 5_000);
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
async function playSong(queue) {
    console.log('Executing play song.');
    const currentQueue = queue.get(OPs_IDs_json_1.PLDYNID);
    if (!currentQueue) {
        return;
    }
    if (currentQueue.songs.length === 0) {
        return handleEmptyQueue(queue, currentQueue);
    }
    const song = currentQueue.songs[0];
    const connection = await joinChannel(currentQueue.voiceChannel);
    currentQueue.player = await getPlayer(song);
    connection.subscribe(currentQueue.player);
    currentQueue.isPlaying = true;
    currentQueue.player.on(voice_1.AudioPlayerStatus.Idle, () => {
        currentQueue.isPlaying = false;
        handleSongEnd(queue, currentQueue);
    });
    sendNowPlaying(currentQueue);
}
function handleSongEnd(currentQueue, playerQueue) {
    console.log('Handling song end.');
    if (playerQueue !== null) {
        const song = playerQueue.songs[0];
        playerQueue.songs.shift();
        playSong(currentQueue);
    }
}
function handleEmptyQueue(currentQueue, playerQueue) {
    console.log('Handling empty queue.');
    const connection = (0, voice_1.getVoiceConnection)(OPs_IDs_json_1.PLDYNID);
    if (playerQueue.voiceChannel.members.size === 0) {
        connection?.destroy();
        currentQueue.delete(OPs_IDs_json_1.PLDYNID);
        defaultReportChannel.send('*Grumbles to self about streaming music to an empty channel.*');
        return;
    }
    setTimeout(() => {
        if (playerQueue.songs.length === 0) {
            connection?.destroy();
            currentQueue.delete(OPs_IDs_json_1.PLDYNID);
        }
    }, 300000);
}
function sendNowPlaying(playerQueue) {
    const song = playerQueue.songs[0];
    defaultReportChannel.send(`__Now Playing__\n**${song.title}** (${song.durationFriendly})`);
}
function help() {
    return 'Fires up an audio stream in your current VC.';
}
//Exports
exports.default = {
    name: 'Play',
    data,
    execute,
    help
};
