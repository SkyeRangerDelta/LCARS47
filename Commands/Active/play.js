//PLAY

//REQUIREMENTS
const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');
const sysch = require('../../Subsystems/subs_channels.json');
const fs = require('fs');

const ytdl = require('ytdl-core');
const YouTube = require('simple-youtube-api');

const yt = new YouTube(system.systemGAPI);

//SCRIPT VARIABLES
var lcarsVersion = system.version;
var lcarsColor = system.lcarscolor;

exports.run = (lcars, msg, cmd) => { //BEGIN EXECUTION
    msg.delete();

    console.log("[MUSI-SYS] Complete Command: " + cmd);

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

        //YouTube Playlist Initialization
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

    async function handleAccept(video, msg, playlist = false) {
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
                lcars.musicPlaying = false;
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
        lcars.musicPlaying = true;

    }

    //CUSTOM PLAYLIST HANDLING
    async function handlePlaylist() {

        const userPlaylistFolder = "./Subsystems/Custom Playlists/" + msg.author.id + "/";
        var playlistDir;

        try {
            fs.access(userPlaylistFolder, fs.constants.F_OK, (err) => {
                if (err) {
                    console.log("[MUSI-SYS]" + `${userPlaylistFolder} ${err ? ' couldnt be located.' : ' was found.'}\n[MUSI-SYS] Attempting to create a new directory...`);
                    try {
                        fs.mkdir(userPlaylistFolder, {recursive: true}, (err) => {
                            if (err) {
                                console.log("[MUSI-SYS] Folder creation failed.\n" + err);
                            }
                            else {
                                console.log("[MUSI-SYS] Folder creation succeeded.");
                                msg.reply("A custom playlist folder has been created within LCARS47. Your custom playlists will be stored here.").then(sent => sent.delete(15000));
                            }
                        });
                    } catch (folderCreateErr) {
                        
                    }
                }
                else {
                    console.log(`${userPlaylistFolder} was located.`);
                }
            });
        } catch (cusPlayError) {
            return console.log("[MUSI-SYS] Something concerning playlist creation has gone wrong.\n\n" + cusPlayError);
        }

        if (cmd[1] == null) {
            return msg.reply("Command invalidated; Seriously? Give me something here.");
        }

        // == PLAYLIST PARAMETERS ==
        // -- NEW PARAMETER --
        if (cmd[1] == "new") {
            if (cmd[2] == null) {
                return msg.reply("Playlist invalidated, new playlists must have names.").then(sent => sent.delete(15000));
            }

            var playlistName = cmd[2];
            var playlistFile = playlistName + ".json";
            playlistDir = userPlaylistFolder + playlistFile;

            fs.access(playlistFile, fs.constants.F_OK, (err) => {
                if (!err) {
                    console.log("[MUSI-SYS] This playlist already exists!");
                    return msg.reply("That playlist already exists!").then(sent => sent.delete(15000));
                }
            });

            try {
                fs.writeFileSync(playlistDir, '{"songs":[]}');
                console.log("[MUSI-SYS] Created the playlist file: " + playlistFile);
            } catch (createFile) {
                console.log("[MUSI-SYS] Failed to create the playlist file.");
            }

            console.log("CMD[3] " + cmd[3]);

            if (typeof cmd[3] !== 'undefined') {
                var flag = cmd[3];
                flag = flag.toLowerCase();

                switch (flag) {
                    case "a":
                        console.log("[MUSI-SYS] Add flag found");

                        try {
                            let intake = cmd[4].toLowerCase();
                            if (intake == "c" || intake == "current") {
                                console.log("[MUSI-SYS] Attempting to add the current song to the " + playlistName + " playlist.");
                                if (!lcars.serverQueue) {
                                    return msg.reply("There's no song currently playing!").then(sent => sent.delete(15000));
                                } else {
                                    let value = lcars.serverQueue.songs[0].url;
                                    let identifier = lcars.serverQueue.songs[0].title;

                                    addToPlaylist(playlistDir, identifier, value);
                                }
                            }
                            else if (cmd[4].includes(".com")) {
                                try {
                                    var tempVid = await yt.getVideo(cmd[4]);
                                    addToPlaylist(playlistDir, tempVid.title, tempVid.url);
                                } catch (newLinkAdd) {
                                    console.log("[MP-NPBL] Failed to create a new playlist with a link:\n" + newLinkAdd);
                                    return msg.reply("Failed to add the requested link to the new playlist.").then(sent => sent.delete(15000));
                                }
                            }
                            else {
                                try {
                                    let vidLink = cmd[4] ? cmd[4].replace(/<(.+)>/g, '$1') : '';
                                    let vid;

                                    try {
                                        console.log("[MUSI-SYS] Attempting to collect video.");
                                        vid = await yt.getVideo(vidLink);
                                    } catch (collectionError) {
                                        return console.log("[MUSI-SYS] Video collection in for a new playlist's addition failed.");
                                    }

                                    console.log("[MUSI-SYS] Attempting to add the linked song to the " + playlistName + " playlist.");
                                    addToPlaylist(playlistDir, vid.title, vid.url);
                                } catch (linkedSongError) {
                                    return console.log("[MUSI-SYS] Failed to add the linked video to the playlist.");
                                }
                            }
                        } catch (addError) {
                            msg.reply("We're HAVING TROUBLE HERE...").then(sent => sent.delete(15000));
                            console.log("We're HAVING TROUBLE HERE....\n" + addError);
                        }
                    break;
                    default:
                        msg.reply("Was that a flag?")
                        console.log("[MUSI-SYS] No or invalid flag found.");
                    break;
                }
            }
            else {
                console.log("[MUSI-SYS] No or invalid flag found.");
            }
        }
        // -- ADD PARAMETER --
        else if (cmd[1] == "add") {
            if (cmd[2] == null) {
                return msg.reply("Command invalidated; you have to specify where to add the song.").then(sent => sent.delete(15000));
            }
            else if (cmd[3] == null) {
                return msg.reply("Command invalidated; you cannot add nothing to a playlist.").then(sent => sent.delete(15000));
            }

            var currentParam = cmd[3].toLowerCase();
            let vidLink = cmd[3] ? cmd[3].replace(/<(.+)>/g, '$1') : '';
            let vidResponse;
            var vids;
            var playlistSearchResultNum;
            var playlistSearch = cmd.splice(3).join(' ');
            playlistDir = userPlaylistFolder + cmd[2] + ".json";

            if (currentParam == "c" || currentParam == "current") {
                return addToPlaylist(playlistDir, lcars.serverQueue.songs[0].title, lcars.serverQueue.songs[0].url);
            }

            try {
                vidResponse = await yt.getVideo(vidLink);
                addToPlaylist(playlistDir, vidResponse.title, vidResponse.url);
            } catch (vidAddErr) {

                console.log("[MP-ATP] Listed command: " + cmd);
                console.log("[MP-ATP] Playlist Search Term: " + playlistSearch);

                vids = await yt.searchVideos(playlistSearch);
                playlistSearchResultNum = vids.length;

                console.log("[MUSI-SYS] Listing Videos...");
                for (var t = 0; t < vids.length; t++) {
                    resp = await yt.getVideoByID(vids[t].id);
                    console.log(t + ": " + resp.title);
                }

                let vidSearchInd = 0;

                //Search result Info Report
                var searchResultPanel = new Discord.RichEmbed();
                    searchResultPanel.setTitle("o0o - Library Search Results - o0o");
                    searchResultPanel.setColor(lcarsColor);
                    searchResultPanel.setDescription(
                        "**Search Term**: " + playlistSearch + "\n" +
                        "**Result Count**: Top " + numResults + "\n" +
                        "**========================================**\n" +
                        `${vids.map(songresults => `${++vidSearchInd} => ${songresults.title}`).join('\n')}\nSelect a result using 1-` + numResults + ` as a next message.`
                    );
                msg.reply({embed: searchResultPanel}).then(sent => sent.delete(15000));

                var vidResp = 1;
                    
                try {
                    vidResp = await msg.channel.awaitMessages(playlistSelect => playlistSelect.content > 0 && playlistSelect.content < playlistSearchResultNum, {
                        maxMatches: 1,
                        time: 15000,
                        errors: ['time']
                    });
                } catch (searchErr) {
                    console.log("[MUSI-SYS] Add to Playlist Failed: Reponse Timed Out (MP-LTO)");
                    msg.reply("`[MP-ATP]` Add to Playlist Failed: Reponse Timed Out").then(sent => sent.delete(30000));
                    return;
                }

                var vidInd = parseInt(vidResp.first().content);

                playlistVid = await yt.getVideoByID(vids[vidInd - 1].id);

                addToPlaylist(playlistDir, playlistVid.title, playlistVid.url);
            }
        }
        // -- REMOVE PARAMETER --
        else if (cmd[1] == "remove") {

            playlistDir = userPlaylistFolder + cmd[2] + ".json";

            if (cmd[2] == null) {
                return msg.reply("Command invalidated; you didn't specify anything to remove.").then(sent => sent.delete(15000));
            }
            else if (cmd[3] != null) {
                if (cmd[3].toLowerCase() == "c" || cmd[3].toLowerCase() == "current") {
                    if (!lcars.serverQueue) {
                        return msg.reply("There's no current song playing!").then(sent => sent.delete(15000));
                    }
                    else {
                        console.log("[MP-RFP] Value indicates current song.")
                        removeFromPlaylist(playlistDir, lcars.serverQueue.songs[0].url, false);
                    }
                }
                else if (cmd[3].includes(".com")) {
                    console.log("[MP-RFP] Value includes a url.")
                    removeFromPlaylist(playlistDir, cmd[3], false);
                }
                else {
                    console.log("[MP-RFP] Value is considered a title.")
                    removeFromPlaylist(playlistDir, cmd[3], true);
                }
            }
            else {
                msg.reply("Are you sure you want to remove the " + cmd[2] + " playlist? (Yes to confirm)").then(sent => sent.delete(20000));

                var verifyCheck = false;
                try {
                    verifyCheck = await msg.channel.awaitMessages(verification => verification.content == "Yes" || verification.content == "yes", {
                        maxMatches: 1,
                        time: 15000,
                        errors: ['time']
                    })
                } catch (verifyError) {
                    msg.reply("`[MP-RP]` No confirm response: Playlist not deleted.").then(sent => sent.delete(10000));
                    return;
                }

                if (verifyCheck) {
                    try {
                        fs.access(playlistFile, fs.constants.F_OK, (err) => {
                            if (!err) {
                                console.log("[MUSI-RP] Playlist exists...deleting...");
                                fs.delete(playlistDir);
                                msg.reply("Playlist deleted.").then(sent => sent.delete(10000));
                            }
                        });
                    } catch (deleteErr) {
                        console.log("[MP-RP] Something's come up.");
                        msg.reply("`[MP-RP]` Mmmmm, circuit wasn't strong enough...that playlist didn't get deleted. Aherm, " + ranger);
                        return;
                    }
                }
            }
        }
        // -- DOWNLOAD PARAMETER --
        else if (cmd[1].toLowerCase() == "dl" || cmd[1].toLowerCase() == "download") {

            let playlist = userPlaylistFolder + cmd[2] + ".json";

            if (cmd[2] == null) {
                return msg.reply("Command invalidated; you cannot download a playlist that doesn't exist.").then(sent => sent.delete(15000));
            }

            try {
                fs.access(playlist, fs.constants.F_OK, (err) => {
                    if (!err) {
                        console.log("[MUSI-VPI] Playlist exists.");
                        
                        try {
                            msg.channel.send("Playlist Download Request:\n\tPlaylist: " + cmd[2] + "\n\tAuthor: " + msg.author.username, {files:[playlist]});
                        } catch (fileUploadError) {
                            console.log("[MP-DLP] Upload failed:\n" + fileUploadError);
                            return msg.reply("Something went wrong in the upload process. Perhaps your playlist is too powerful for a file upload?\nError: " + fileUploadError);
                        }

                    }
                    else {
                        console.log("[MUSI-VPI] Playlist doesn't exist.");
                    }
                });
            } catch (deleteErr) {
                console.log("[MP-VPI] Something's come up.");
                msg.reply("Hmmm, what....happened here.\n" + deleteErr).then(sent => sent.delete(15000));
            }
        }
        // -- PLAY PARAMETER --
        else {
            if (cmd[1] == null) return msg.reply("Command invalidated; no playlist specified.");

            var playlist = userPlaylistFolder + cmd[1] + ".json";

            try {
                fs.access(playlist, fs.constants.F_OK, (err) => {
                    if (!err) {
                        console.log("[MUSI-RP] Playlist exists.");
                    }
                });
            } catch (playErr) {
                console.log("[MP-PLPL] Something's come up.");
                msg.reply("`[MP-PLPL]` Mmmmm, circuit wasn't strong enough...couldn't queue up the playlist.");
                return;
            }

            var playlistFile = JSON.parse(fs.readFileSync(playlist, 'utf8'));

            try {
                for (y in playlistFile.songs) {
                    const media = await yt.getVideo(playlistFile.songs[y].url);
                    await handleAccept(media, msg, userVC, true);
                }
            } catch (queueAddErr) {
                console.log("[MP-QDE] Something isn't right in the custom playlist player.\n" + queueAddErr);
                return msg.reply("[MP-QDE] Mmmm, something's not right on the inside. CHeck the circuits " + ranger + "?");
            }
        }
    }

    function addToPlaylist(fileDir, entry, entryVal) {
        try {
            console.log("[MUSI-SYS] Attempting to check the existence of the playlist " + fileDir);
            fs.access(fileDir, fs.constants.F_OK, (err) => {
                if (err) {
                    console.log("[MUSI-SYS] Couldn't find the playlist file whilst attempting to add a song.");
                    msg.reply("I couldn't add a song to the file because I couldn't find the playlist file.");
                    return;
                }
                else {
                    var playlistJson = JSON.parse(fs.readFileSync(fileDir, 'utf8'));

                    try {
                        for (song in playlistJson.songs) {
                            if (song == entry) {
                                msg.reply("This song is already in this playlist, are you sure you want to add it again?\nYes/No").then(sent => sent.delete(15000));                      

                                if (getResponse) {
                                    let newEntry = {"title": entry, "url": entryVal};
                                    playlistJson.songs.push(newEntry);
                                    msg.reply("Song added to playlist " + cmd[2] + "!").then(sent => sent.delete(15000));
                                    return;
                                }
                                else {
                                    msg.reply("Command invalidated.").then(sent => sent.delete(15000));
                                    return;
                                }
                            }
                        }

                        let newEntry = {"title": entry, "url": entryVal};
                        playlistJson.songs.push(newEntry);

                    } 
                    catch (jsonReadErr) {
                                
                    }

                    console.log("[MUSI-SYS] Saving changes...");
                    fs.writeFileSync(fileDir, JSON.stringify(playlistJson));

                    msg.reply("Song added to playlist.").then(sent => sent.delete(10000));
                }
            });
        } catch (addErr) {
            
        }
    }

    function removeFromPlaylist(fileDir, value, name) {

        var playlist = JSON.parse(fs.readFileSync(fileDir, 'utf8'));

        try {
            if (name) {
                for (i in playlist.songs) {
                    console.log("Sifting through keys...\n" + i.title);
                    if (i.title == value) {
                        console.log("[MP-RFP] Flagged a title remove value in playlist. Deleting...");
                        delete(i);
                        fs.writeFileSync(fileDir, JSON.stringify(playlist));
                        msg.reply("Value deleted from playlist.").then(sent => sent.delete(10000));
                    }
                }

                performCleanup(fileDir);

                return msg.reply("Couldn't find that title value. Perhaps it's in a different playlist?").then(sent => sent.delete(10000));
            }
            else {

                let flagged = false;

                for (t in playlist.songs) {
                    console.log("Sifting through keys...\n" + playlist.songs[t].url);
                    if (playlist.songs[t].url == value) {
                        console.log("[MP-RFP] Flagged a url remove value in playlist. Deleting...");
                        delete(playlist.songs[t]);
                        flagged = true;
                        fs.writeFileSync(fileDir, JSON.stringify(playlist));
                        msg.reply("Value deleted from playlist.").then(sent => sent.delete(10000));
                    }
                }

                performCleanup(fileDir);

                if (!flagged) {
                    return msg.reply("Couldn't find that url value. Perhaps it's in a different playlist?").then(sent => sent.delete(10000));
                }
            }
        } catch (removeErr) {
            console.log("[MP-RFP] Failed to remove an item from a playlist.\n" + removeErr);
            return msg.reply("Command failed, couldn't remove the song from the playlist.");
        }
    }

    function performCleanup(playDir) {

        console.log("[MP-PLCU] ====ATTEMPTING PLAYLIST CLEANUP====\n" + 
                    "Requested Playlist Directory: " + playDir);

        var playlistToClean = JSON.parse(fs.readFileSync(playDir, 'utf8'));

        try {
            playlistToClean.songs = playlistToClean.songs.filter(e => e !== null && e !== "");

            fs.writeFileSync(playDir, JSON.stringify(playlistToClean));
            return;
        } catch (cleanupErr) {
            console.log("[MP-PLCU] Cleanup has hit a snag: \n" + cleanupErr);
            return msg.channel.send(ranger + " sir, playlist cleanup issued by " + msg.author.username + " has been snagged, check the file system please.");
        }
    }

    async function getResponse() {
        var response;
        response = await msg.channel.awaitMessages(msg2 => msg2.content.toLowerCase() == "yes", {
            maxMatches: 1,
            time: 10000,
            errors: ['time']
        });

        return response;
    }

    //PERMISSIONS CHECK
    console.log("[MUSI-SYS] Checking User Permissions");
    if (msg.member.roles.find("name", "Shipmate")) {
        if (engmode) {
            msg.reply("Engineering Mode is enabled! You cannot use the player while it is on.").then(sent => sent.delete(20000));
        }
        else {
            if (cmd[0] == "playlist") {
                console.log("[MUSI-SYS] Playlist mode enabled.");
                handlePlaylist();
            }
            else {
                accept();
            }
        }
    }
    else if (msg.member.roles.find("name", "Captain") || msg.member.roles.find("name", "Vice Admiral") || msg.member.roles.find("name", "Admiral")) {
        if (engmode) {
            msg.reply("`[Engineering Mode]` Staff override acknowledged.").then(sent => sent.delete(20000));
        }

        if (cmd[0] == "playlist") {
            console.log("[MUSI-SYS] Playlist mode enabled.");
            handlePlaylist();
        }
        else {
            accept();
        }
    }
    else {
        msg.reply("You do not have the proper permissions to run the music player.");
    }
}