//HELP

const Discord = require('discord.js');
const system = require('./lcars_subsystem.json');

const lcarsColor = "#f4eb42"

var lcarsVersion = system.version;

exports.run = (lcars, msg, cmd) => {
    var help = new Discord.RichEmbed();
        help.setTitle("o0o - LCARS COMMAND LISTING - o0o");
        help.setColor(lcarsColor);
        help.setDescription(
            "LCARS" + version + " | Complete Command Listing\n"+
            "===============================================\n"+
            "`!help`: Displays this menu"
        );

    msg.channel.send({embed: help}).then(sent => sent.delete(60000));
}