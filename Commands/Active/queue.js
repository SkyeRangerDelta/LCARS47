const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');
const sysch = require('../../Subsystems/subs_channels.json');

exports.run = (lcars, msg, cmd) => {
    msg.delete();

    var musicLog = lcars.channels.get(sysch.musicLog);

    if (!lcars.serverQueue) {
        msg.reply("Command ignored. Player is not active.").then(sent => sent.delete(20000));
        return;
    }

    var queueInfoPanel = new Discord.RichEmbed();
        queueInfoPanel.setTitle("o0o - Player Queue - o0o");
        queueInfoPanel.setColor(system.lcarscolor);
        queueInfoPanel.setDescription(
            `${lcars.serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}`
        );
        queueInfoPanel.addField("Now Playing", `${lcars.serverQueue.songs[0].title}`, true);

    musicLog.send({embed: queueInfoPanel});
    return;

}