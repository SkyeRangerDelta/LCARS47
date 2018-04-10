//HELP

const Discord = require('discord.js');
const system = require('../lcars_subsystem.json');

const lcarsColor = "#f4eb42"

var version = system.version;

exports.run = (lcars, msg, cmd) => {

    msg.delete();

    var help = new Discord.RichEmbed();
        help.setTitle("o0o - LCARS COMMAND LISTING - o0o");
        help.setColor(lcarsColor);
        help.setDescription(
            "LCARS" + version + " | Complete Command Listing\n"+
            "===============================================\n"+
            "`!help`: Displays this menu\n"+
            "`!status`: Shows the session variables for LCARS.\n"+
            "`!engm`: Toggle LCARS' Engineering Mode."
        );

    msg.channel.send({embed: help}).then(sent => sent.delete(60000));
}