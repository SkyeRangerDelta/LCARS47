//PASSIVES
const Discord = require('discord.js');
const system = rtequire('../../Subsystems/lcars_subsystem.json');

exports.run = (lcars, msg, cmd) => {
    var passives = new Discord.RichEmbed();
        passives.setTitle("o0o - LCARS PASSIVE COMMAND LISTING - o0o");
        passives.setColor(system.lcarsColor);
        passives.setDescription(
            "LCARS" + lcars.version + " | Complete Passive Command Listing\n"+
            "===============================================\n"+
            "`hello`: Greeting\n\n"+
            "`This message will delete itself in 1 minute.`"
        );

    msg.channel.send({embed: passives}).then(sent => sent.delete(60000));
}