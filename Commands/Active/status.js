//STATUS

const Discord = require(`discord.js`);
const system = require(`../../Subsystems/subs_Ops/subs_settings.json`);

module.exports = {
    run,
    help
}

function run(lcars, msg, cmd) {
    msg.delete({timeout: 0});

    msg.reply(`Temporarily unavailable`);
}

function help() {
    return `Displays a list of LCARS47's system states and statistics`;
}