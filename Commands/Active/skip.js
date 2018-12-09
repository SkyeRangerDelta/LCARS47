const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');
const sysch = require('../../Subsystems/subs_channels.json');

exports.run = (lcars, msg, cmd) => {
    msg.delete();

    var musicLog = lcars.channels.get(sysch.musicLog);

    if (msg.member.voiceChannel != lcars.vc) {
        msg.reply("User not recognized. Commands not taken from users not joined to player channel.");
    }
    else {
        if ((msg.member.roles.find('name', 'Captain')) || msg.member.roles.find('name', 'Vice Admiral') || msg.member.roles.find('name', 'Admiral')) {

            if (!lcars.serverQueue) {
                msg.reply("Command ignored. Player is not active.");
            }
            else {
                lcars.serverQueue.connection.dispatcher.end();

                var skipInfoPanel = new Discord.RichEmbed();
                    skipInfoPanel.setTitle("o0o - SKIP - o0o");
                    skipInfoPanel.setColor(system.fscolor);
                    skipInfoPanel.setDescription(
                        "Playback skipped a song. Authorized by " + msg.author.tag + "\n"+
                        `**Now Playing**: ${lcars.serverQueue.songs[0].title}`
                    )

                console.log("[MUSI-SYS] Playback skipped a song by " + msg.author.tag);
                musicLog.send({embed: skipInfoPanel});
            }
        }
        else {
            msg.reply("Command Ignored. User not authorized.");
        }
    }
}