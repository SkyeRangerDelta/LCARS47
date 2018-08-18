//HELP

const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');

const lcarsColor = "#f4eb42"

exports.run = (lcars, msg, cmd) => {
    var help = new Discord.RichEmbed();
        help.setTitle("o0o - LCARS COMMAND LISTING - o0o");
        help.setColor(lcarsColor);
        help.setDescription(
            "LCARS " + lcars.version + " | Complete Command Listing\n"+
            "===============================================\n"+
            "`!help`: Displays this menu\n"+
            "`!passives`: Displays the passive command list.\n"+
            "`!play [link/searchTerm]`: Adds a YouTube video/playlist to the queue to be played.\n\n"+
            "`This message will delete itself in 1 minute.`"
        );

    msg.channel.send({embed: help}).then(sent => sent.delete(60000));
}