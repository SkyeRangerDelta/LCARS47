const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');
const sysch = require('../../Subsystems/subs_channels.json');

exports.run = (lcars, msg, cmd) => {
    msg.delete();

    const musicLog = lcars.channels.get(sysch.musicLog);

    if (msg.member.voiceChannel != lcars.vc) {
        msg.reply("User not recognized. Commands not taken from users not joined to player channel.").then(sent => sent.delete(20000));
    }
    else if (msg.member.roles.find("name", "Captain") || msg.member.roles.find("name", "Admiral") || msg.member.roles.find("name", "Vice Admiral")) {
        if (!lcars.serverQueue) {
            msg.reply("Command ignored. Player is not active.").then(sent => sent.delete(20000));
        }
        else {
            lcars.serverQueue.songs = [];
            lcars.serverQueue.connection.dispatcher.end();

            var stopPanel = new Discord.RichEmbed();
                stopPanel.setTitle("o0o - PLAYER TERMINATED - o0o");
                stopPanel.setColor(system.lcarscolor);
                stopPanel.setDescription(
                    "**Player Terminated by**: " + msg.author.tag
                )

            musicLog.send({embed: stopPanel});
        }
    }
    else {
        msg.reply("Command Ignored. User not authorized.");
    }
}