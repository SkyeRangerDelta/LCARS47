//ENGM

const Discord = require('discord.js');
const system = require('../lcars_subsystem.json');
const fs = require('fs');

const lcarsColor = "#f4eb42"

let engmode;

exports.run = (lcars, msg, cmd) => {

    if (msg.member.roles.find('name', 'Admiral') || msg.member.roles.find('name', 'Dev Team')) {
        var SUBS_Engm = JSON.parse(fs.readFileSync("../Subsystems/subs_engmode.json", "utf8"));
        engmode = SUBS_Engm.engmode;

        engmode = !engmode;

        fs.writeFileSync("../Subsystems/subs_engmode.json", JSON.stringify(SUBS_Engm));

        console.log('[ENG-MODE] Toggled to ' + engmode + ' by ' + msg.author.tag)

        msg.reply('LCARS47 Engineering Mode toggled ' + engmode + '.');
    }
}