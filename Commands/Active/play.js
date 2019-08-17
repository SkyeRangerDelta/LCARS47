//----PLAY----

//COMMAND VARS
const Discord = require('discord.js');
const sysch = require('../../Subsystems/subs_channels.json');
const system = require('../../Subsystems/lcars_subsystem.json');

const ytdl = require('ytdl-core');
const ytcore = require('simple-youtube-api');
const ytAPI = new ytcore(system.systemGAPI);

const ytSteam = require('youtube-audio-stream');
const ytdlAlt = require('youtube-dl');

let vhours;
let vseconds;
let vlength;

let song;

exports.run = async (lcars, msg, cmd) => {
    msg.delete();
    console.log("[MUSI-SYS] Running Play Command");

    lcars.pldynGuildID = msg.guild.id;

    lcars.playlist = lcars.queue.get(lcars.pldynGuildID);

    let musicLog = lcars.channels.get(sysch.musicLog);

    const url = cmd[0] ? cmd[0].replace(/<(.+)>/g, '$1') : '';
    let userVC = msg.member.voiceChannel;

    var video;
    var vInfo;

    //Collect Video Object

    console.log("Checking URL: " + url);

    try {
        video = await ytAPI.getVideo(url);
        vInfo = await ytdl.getInfo(url);
    } catch (error) {
        return msg.reply("Unhandled URL\n" + error);
    }

    return executeStream(video, vInfo, msg, userVC);

    async function executeStream(video, vInfo, msg, uservc) {
        //Cleanup length
        if (video.duration.hours == 0) {
            vhours = ``;
        }
        else {
            vhours = `${video.duration.hours}:`
        }
        
        if (video.duration.seconds < 10) {
            vseconds = `0${video.duration.seconds}`;
        }
        else {
            vseconds = video.duration.seconds;
        }
    
        vlength = vhours + `${video.duration.minutes}:` + vseconds;
    
        //Collect video info
        try {
            song = {
                title: video.title,
                requester: msg.member.nickname,
                author: video.channel.title,
                url: `https://youtube.com/watch?v=${video.id}`,
                id: video.id,
                length: vlength,
                thumb: video.maxRes.url
            };
    
            console.log("Logging song obj...");
            console.log(song);
    
        } catch (error) {
            console.log("[MUSI-SYS] Song Data Collection Failure (MP-SDC1): " + collectionErr);
            msg.reply("`[CRASH PREVENTION SUBROUTINE] [MP-SDC1]` Song Information Failure. Try a different song.");
            return;
        }
    
        if (song == null) {
            return msg.reply("Play command invalidated.");
        }
    
        if (!lcars.playlist) { //Initial Song Push to Queue
            const queueConstruct = {
                txtCh: msg.channel,
                vCh: uservc,
                connection: null,
                songs: [],
                volume: 2,
                playing: true
            };
    
            lcars.queue.set(lcars.pldynGuildID, queueConstruct);
            queueConstruct.songs.push(song);
    
            try {
                var connection = await uservc.join();
                console.log("Attempting to play new queued song...");
                lcars.vc = uservc;

                let newSongAdded = new Discord.RichEmbed();
                newSongAdded.setTitle("o0o - New Song Added - o0o");
                newSongAdded.setDescription(
                    `[${song.title}](${song.url})\n` +
                    "Length: `" + song.length + "`\n" + 
                    "Requested by: `" + song.requester + "`"
                );
                newSongAdded.setThumbnail(song.thumb);
    
                musicLog.send({embed: newSongAdded});
    
                queueConstruct.connection = connection;
                play(msg.guild, queueConstruct.songs[0], uservc);

            } catch (playErr) {
                return msg.reply("Looks like something's gone awry.\n" + playErr);
            }
        } else { //Add songs to queue since player is already active

            console.log("Attempting to add song to playing queue...");

            lcars.playlist.songs.push(song);
    
            let newSongAdded = new Discord.RichEmbed();
                newSongAdded.setTitle("o0o - New Song Added - o0o");
                newSongAdded.setDescription(
                    `[${song.title}](${song.url})\n` +
                    "Length: `" + song.length + "`\n" + 
                    "Requested by: `" + song.requester + "`"
                );
                newSongAdded.setThumbnail(song.thumb);
    
            musicLog.send({embed: newSongAdded});
            return;
        }

        return;
    }

    function play(guild, song, uservc) {
        lcars.serverQueue = lcars.queue.get(guild.id);
    
        if (!song) {
            console.log("[MUSI-LOG] No song found.");
    
            lcars.serverQueue.vCh.leave();
            lcars.queue.delete(guild.id);
            lcars.musicPlaying = false;
            return;
        }
    
        const musicStream = ytdlAlt(song.url, ["-f bestaudio", "-i"], {start: numDl});
        musicStream.on('info', function(i) {
            console.log("[MUSIC STREAM STARTED]");
            console.log("Format: " + i.format + "\nUploader: " + i.uploader + "\nTitle: " + i.title + "\nTrack: " + i.track);
        });

        musicStream.on('end', function() {
            console.log("[MUSIC END]\n");
        });

        musicStream.on('complete', c => {
            console.log("[MUSIC STREAM ENDED] Complete\n" + c);
        })

        if (!musicStream) {
            console.log("[MUSI-SYS] No stream, terminating.");
            return msg.channel.send("I don't have a stream to send!");
        }

        const playerStream = lcars.serverQueue.connection.playStream(musicStream);

        playerStream.on('start', t => {
            console.log("[MUSI-SYS] Player Stream started.");
        });
        
        playerStream.on('error', reason => {
            console.log("Readstream error, reason:\n" + reason.stack);
        });

        playerStream.on('debug', item => {
            console.log("[MUSI-SYS] [DEBUG] " + item);
        });

        playerStream.on('end', reason => {
            if (reason === 'Stream is not generating quickly enough.') {
                console.log("[MUSI-SYS] PlayStream ended due to excessive lag.");
            } else {
                console.log("PlayStream ended at " + playerStream.time + ", reason:\n" + reason);
            }

            lcars.serverQueue.songs.shift();
            play(guild, lcars.serverQueue.songs[0], uservc);
        });
    
        playerStream.setVolumeLogarithmic(lcars.serverQueue.volume / 5);
    
        let nowPlaying = new Discord.RichEmbed();
            nowPlaying.setTitle("o0o - Now Playing - o0o");
            nowPlaying.setDescription(
                `[${song.title}](${song.url})\n` +
                "Length: `" + song.length + "`\n" + 
                "Requested by: `" + song.requester + "`"
            );
            nowPlaying.setThumbnail(song.thumb);
    
        musicLog.send({embed: nowPlaying});
        lcars.musicPlaying = true;
    }
}