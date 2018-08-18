//PLAY

//REQUIREMENTS
const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');
const sysch = require('../../Subsystems/subs_channels.json');

const ytdl = require('ytdl-core');
const YouTube = require('simple-youtube-api');

const yt = new YouTube(system.systemGAPI);

//SCRIPT VARIABLES
var lcarsVersion = system.version;
var lcarsColor = system.lcarscolor;

exports.run = (lcars, msg, cmd) => { //BEGIN EXECUTION
    msg.delete();

    lcars.playlist = lcars.queue.get(lcars.pldynGuildID);

    //Channel Defs
    var tenForwardVC = lcars.channels.get(sysch.tenForwardVC);
    var quarksBarVC = lcars.channels.get(sysch.quarksBarVC);
    var conferenceRoomVC = lcars.channels.get(sysch.conferenceRoomVC);
    var musicLog = lcars.channels.get(sysch.musicLog);

    //User Defs
    var ranger = lcars.users.get('107203929447616512');

    //Player Definitions
    const url = cmd[0] ? cmd[0].replace(/<(.+)>/g, '$1') : '';
    var searchString = cmd.slice(0).join(' ');

    var userVC = msg.member.voiceChannel;

    var vhours;
    var vseconds;
    var vlength;

    var song;
    var video;
    var videos;
    var numResults = 0;

    //ENGM Notes
    let engmode = lcars.engmode;

    //INITIALZE
    console.log("[MUSI-SYS] Play command recognized. Issuer: " + msg.author.tag + ".");
    console.log("=======PLAY COMMAND=======");
    console.log("[MUSI-SYS] Player ENGM is currently: " + engmode);
    console.log("[MUSI-SYS] Issuer Guild ID: " + msg.guild.id);

    //FUNCTIONS
    async function accept() {
        console.log("[MUSI-SYS] Permissions Granted");

        //Playlist Initialization
        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
            console.log("[MUSI-SYS] Playlist Detected");

            const playlist = await yt.getPlaylist(url);
            videos = await playlist.getVideos();

            for (const video of Object.values(videos)) {
                const video2 = await yt.getVideoByID(video.id);
                await handleAccept(video2, msg, userVC, true);
            }

            //Playlist Info Report
            var playlistInfoPanel = new Discord.RichEmbed();
                playlistInfoPanel.setTitle("o0o - Playlist Added - o0o");
                playlistInfoPanel.setColor(lcarsColor);
                playlistInfoPanel.setDescription(
                    "**Playlist Title**: " + playlist.title + "\n" +
                    "**Author**: " + playlist.channel.title
                );
            musicLog.send({embed: playlistInfoPanel});
        }
        //Video & Search Function Handler
        else {
            try {
                video = await yt.getVideo(url);
            }
            catch (t1err) {
                try {
                    videos = await yt.searchVideos(searchString);
                    numResults = videos.length;

                    console.log("[MUSI-SYS] Listing Videos...");
                    for (var t = 0; t < videos.length; t++) {
                        result = await yt.getVideoByID(videos[t].id);
                        console.log(t + ": " + result.title);
                    }

                    let searchIndex = 0;

                    //Search result Info Report
                    var searchResultPanel = new Discord.RichEmbed();
                        searchResultPanel.setTitle("o0o - Library Search Results - o0o");
                        searchResultPanel.setColor(lcarsColor);
                        searchResultPanel.setDescription(
                            "**Search Term**: " + searchString + "\n" +
                            "**Result Count**: Top " + numResults + "\n" +
                            "**========================================**\n" +
                            `${videos.map(songresults => `${++searchIndex} => ${songresults.title}`).join('\n')}\nSelect a result using 1-` + numResults + ` as a next message.`
                        );
                    msg.reply({embed: searchResultPanel}).then(sent => sent.delete(15000));

                    var response = 1;
                    
                    try {
                        response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < numResults, {
                            maxMatches: 1,
                            time: 15000,
                            errors: ['time']
                        });
                    } catch (searchErr) {
                        console.log("[MUSI-SYS] Library Search Failed: Reponse Timed Out (MP-LTO)");
                        msg.reply("`[MP-LTO]` Library Search Failed: Reponse Timed Out").then(sent => sent.delete(30000));
                        return;
                    }

                    var videoIndex = parseInt(response.first().content);

                    video = await yt.getVideoByID(videos[videoIndex - 1].id);

                } catch (t2err) {
                    console.log("[MUSI-SYS] Data Collection Error (MP-DCT2): " + t2err);
                    msg.reply("`[MP-DCT2]` Library yielded no results.").then(sent => sent.delete(20000));
                }

                console.log("[MUSI-SYS] Data Collection Error (MP-DCT1): " + t1err);
            }

            return handleAccept(video, msg, userVC);

        }
    }

    async function handleAccept(video, msg, voiceChannel, playlist = false) {
        lcars.playlist = lcars.queue.get(lcars.pldynGuildID);

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

        try {
            console.log("[MUSI-SYS] Attempting to collection song information...");

            song = {
                title: video.title,
                description: video.description,
                author: video.channel.title,
                url: `https://youtube.com/watch?v=${video.id}`,
                id: video.id,
                length: vlength
            }

            console.log("[MUSI-SYS] Logging song information:\n"+
                '->Title: ' + song.title + '\n' +
                '->Author: ' + song.author + '\n' +
                '->ID: ' + song.id + '\n' +
                '->Length: ' + song.length + "\n" +
                '->URL: ' + song.url + '\n'
            );

        } catch (collectionErr) {
            console.log("[MUSI-SYS] Song Data Collection Failure (MP-SDC1): " + collectionErr);
            msg.reply("`[CRASH PREVENTION SUBROUTINE] [MP-SDC1]` Song Information Failure. Try a different song.");
            return;
        }

        if (song == null) {
            console.log("[MUSI-SYS] Invalid Song Data (MP-ISD1)");
            msg.reply("`[MP-ISD1]` Invalid Song Data: Aborting");
            return;
        }
        else {
            if (!lcars.playlist) {
                const queueConstruct = {
                    txtCh: msg.channel,
                    vCh: userVC,
                    connection: null,
                    songs: [],
                    volume: 2,
                    playing: true
                };

                lcars.queue.set(lcars.pldynGuildID, queueConstruct);
                queueConstruct.songs.push(song);

                try {
                    var connection = await userVC.join();
                    lcars.vc = userVC;

                    queueConstruct.connection = connection;
                    play(msg.guild, queueConstruct.songs[0]);

                    console.log("[MUSI-SYS] Attached to channel and playing song. Setting musicPlaying to true.");
                    lcars.musicPlaying - true;

                    if (!playlist) {
                        var videoInformation = new Discord.RichEmbed();
                            videoInformation.setTitle("o0o - New Song Added - o0o");
                            videoInformation.setColor(lcarsColor);
                            videoInformation.setDescription(
                                "**Title**: " + song.title + "\n" +
                                "**Author**: " + song.author + "\n" +
                                "**URL**: " + song.url
                            );

                        musicLog.send({embed: videoInformation});
                    }

                } catch (connectionErr) {
                    console.log("[MUSI-SYS] Connection to Channel Rejected (MP-CR): " + connectionErr);
                    msg.reply("`[MP-CR]` Connection to Channel Rejected. Notify: " + ranger);
                    return lcars.queue.delete(lcars.pldynGuildID);
                }
            }
            else {
                lcars.playlist.songs.push(song);
                if (playlist) {
                    return;
                }
                else {
                    var newSongPanel = new Discord.RichEmbed();
                        newSongPanel.setTitle("o0o - New Song Added - o0o");
                        newSongPanel.setColor(lcarsColor);
                        newSongPanel.setDescription(
                            "**Title**: " + song.title + "\n" +
                            "**Author**: " + song.author + "\n" +
                            "**Length**: " + song.length + "\n" +
                            "**URL**: " + song.url
                        );
                    musicLog.send({embed: newSongPanel});
                    return;
                }
            }

            return;
        }
    }

    function play(guild, song) {

        lcars.serverQueue = lcars.queue.get(guild.id);

        if (!song) {
            console.log("[MUSI-SYS] No Songs Left In Queue, Terminating Player.");

            lcars.serverQueue.vCh.leave();
            lcars.queue.delete(guild.id);
            lcars.musicPlaying = false;
            return;
        }

        const playerDispatch = lcars.serverQueue.connection.playStream(ytdl(song.url, {quality: '251'}))
        .on('end', reason => {
            if (reason === 'Stream is not generating quickly enough.') {
                console.log("[MUSI-SYS] Dispatch Stream ended due to excessive lag. (MP-SLT)");
            }
            else {
                console.log("[MUSI-SYS] Song Ended.");
            }

            lcars.serverQueue.songs.shift();
            play(guild, lcars.serverQueue.songs[0]);
        })
        .on('error', error => console.log("[MUSI-SYS] Dispatcher encountered an unexpected error (MP-UER). " + error));

        playerDispatch.setVolumeLogarithmic(lcars.serverQueue.volume / 5);

        var nowPlayingPanel = new Discord.RichEmbed();
            nowPlayingPanel.setTitle("o0o - Now Playing - o0o");
            nowPlayingPanel.setColor(lcarsColor);
            nowPlayingPanel.setDescription(
                `**Title**: ${song.title}\n`+
                `**Author**: ${song.author}\n`+
                `**Length**: ${song.length}`
            );

        musicLog.send({embed: nowPlayingPanel});

    }

    //PERMISSIONS CHECK
    console.log("[MUSI-SYS] Checking User Permissions");
    if (msg.member.roles.find("name", "Shipmate")) {
        if (engmode) {
            msg.reply("Engineering Mode is enabled! You cannot use the player while it is on.").then(sent => sent.delete(20000));
        }
        else {
            accept();
        }
    }
    else if (msg.member.roles.find("name", "Captain") || msg.member.roles.find("name", "Vice Admiral") || msg.member.roles.find("name", "Admiral")) {
        if (engmode) {
            msg.reply("`[Engineering Mode]` Staff override acknowledged.").then(sent => sent.delete(20000));
        }

        accept();
    }
    else {
        msg.reply("You do not have the proper permissions to run the music player.");
    }
}