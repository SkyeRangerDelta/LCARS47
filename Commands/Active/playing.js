const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');

exports.run = (lcars, msg, cmd) => {
    msg.delete();

    if (!lcars.serverQueue) {
        msg.reply("Command ignored. Player is not active.").then(sent => sent.delete(20000));
    }

    var playingPanel = new Discord.RichEmbed();
        playingPanel.setTitle("o0o - Now Playing - o0o");
        playingPanel.setColor(system.lcarscolor);
        playingPanel.setDescription(
            `**Title**: ${lcars.serverQueue.songs[0].title}\n`+
            `**Author**: ${lcars.serverQueue.songs[0].author}\n`+
            `**Length**: ${lcars.serverQueue.songs[0].length}`
        );

    return msg.channel.send({embed: playingPanel});
}