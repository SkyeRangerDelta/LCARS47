//SPOTIFY INTEGRATION

const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');

exports.run = (lcars, msg, cmd) => {

    msg.delete();

    msg.reply("This functiion does not yet work.").then(sent => sent.delete(15000));
    
}