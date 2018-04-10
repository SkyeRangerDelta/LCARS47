//STATUS

const Discord = require('discord.js');
const system = require('../lcars_subsystem.json');
const engdoc = require('../Subsystems/subs_engmode.json');
const sessdoc = require('../Subsystems/subs_session.json');

let engmode = engdoc.engmode;
let session = sessdoc.sessionnum;


const lcarsColor = "#f4eb42"

var version = system.version;

exports.run = (lcars, msg, cmd) => {

    msg.delete();

    var status = new Discord.RichEmbed();
        status.setTitle("o0o - LCARS SESSION REPORT - o0o");
        status.setColor(lcarsColor);
        status.setDescription(
            "Engineering Report Console:\n"+
            "=====================================\n"+
            "ACTIVE STATUS: `Online`\n"+
            "Directory Read System: `Online`\n"+
            "Current Directories: `3`\n"+
            "LCARS Running Version: `" + version + "`\n"+
            "[ENG-MODE] Currently: `" + engmode + "`\n"+
            "[SESSION#] `" + session + "`\n"
        );

    msg.channel.send({embed: status}).then(sent => sent.delete(60000));
}