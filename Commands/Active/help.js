//HELP

const Discord = require('discord.js');
<<<<<<< HEAD:Commands/Active/help.js
const system = require('../../Subsystems/lcars_subsystem.json');

const lcarsColor = "#f4eb42"

=======
const system = require('../lcars_subsystem.json');

const lcarsColor = "#f4eb42"

var version = system.version;

>>>>>>> 93febb1bf73a7269dcd9c5fe7b30188ffd4299bf:Commands/help.js
exports.run = (lcars, msg, cmd) => {

    msg.delete();

    var help = new Discord.RichEmbed();
        help.setTitle("o0o - LCARS COMMAND LISTING - o0o");
        help.setColor(lcarsColor);
        help.setDescription(
            "LCARS " + lcars.version + " | Complete Command Listing\n"+
            "===============================================\n"+
            "`!help`: Displays this menu\n"+
<<<<<<< HEAD:Commands/Active/help.js
            "`!passives`: Displays the passive command list.\n"+
            "`!play [link/searchTerm]`: Adds a YouTube video/playlist to the queue to be played.\n\n"+
            "`This message will delete itself in 1 minute.`"
=======
            "`!status`: Shows the session variables for LCARS.\n"+
            "`!engm`: Toggle LCARS' Engineering Mode."
>>>>>>> 93febb1bf73a7269dcd9c5fe7b30188ffd4299bf:Commands/help.js
        );

    msg.channel.send({embed: help}).then(sent => sent.delete(60000));
}