//MUSIC HELP

const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');

exports.run = (lcars, msg, cmd) => {

    msg.delete();

    var help = new Discord.RichEmbed();
        help.setTitle("o0o - LCARS MUSIC LIBRARY HELP - o0o");
        help.setColor(system.lcarscolor);
        help.setDescription(
            "`!play [link/searchTerm]`: Adds a YouTube video/playlist to the queue to be played.\n"+
            "`!skip`: Skips currently playing song. (Staff Only)\n"+
            "`!stop`: Halts playback and disconnects LCARS from the channel.\n"+
            "`!queue`: Shows the current playlist queue.\n"+
            "`!playing`: Shows what is currently playing.\n\n"+
            "`This message will delete itself in 1 minute.`"
        );

    msg.channel.send({embed: help}).then(sent => sent.delete(60000));
}