//HELP

const Discord = require(`discord.js`);
const fs = require(`fs`);
const system = require(`../../Subsystems/subs_Ops/subs_Settings.json`);

module.exports = {
    run,
    help
}

function run(lcars, msg, cmd) {

    msg.delete({timeout: 0});

    //Temporary Notice
    msg.reply(`In the future, LCARS47 commands will be listed on the LCARS Database. This menu will remain here for quick reference however.`).then(sent => sent.delete({timeout: 10000}));

    msg.channel.send(`Building help menu...`).then(sent => sent.delete({timeout: 5000}));

    const commandListing = fs.readdirSync(`./Commands/Active`).filter(cmdFile => cmdFile.endsWith(`.js`));

    let helpMenu = ``;

    for (file in commandListing) {
        try {
            let {help} = require(`./${commandListing[file]}`);
            let cmdID = commandListing[file].substring(0, commandListing[file].length - 3);
            helpMenu = helpMenu.concat(`**${cmdID}**: ${help()}\n`);
        } catch (helpError) {
            throw `${cmd[0]} has no help entry!\n${helpError}`;
        }
    }

    var help = new Discord.MessageEmbed();
        help.setTitle(`-[]- LCARS47 COMMAND LISTING -[]-]`);
        help.setColor(system.lcarscolor);
        help.setDescription(
            `LCARS47 Active Command Listing\n`+
            `------------------------------------------------\n`+
            helpMenu
        );

    msg.channel.send({embed: help}).then(sent => sent.delete({timeout: 60000}));
}

function help() {
    return `Displays this help menu.`;
}