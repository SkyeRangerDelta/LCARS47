"use strict";
// -- STATUS --
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
//Functions
const data = new builders_1.SlashCommandBuilder()
    .setName('status')
    .setDescription('Displays a report of all LCARS47s system states and session variables.');
async function execute(LCARS47, int) {
    console.log('Status interaction in process.');
    await int.reply({ content: 'Neat things here.' });
}
function help() {
    return 'Displays a report of all LCARS47s system states and session variables.';
}
//Exports
exports.default = {
    name: 'Status',
    data,
    execute,
    help
};
