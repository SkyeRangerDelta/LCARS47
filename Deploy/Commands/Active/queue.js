"use strict";
// -- QUEUE --
// Displays the list of songs currently playing
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const builders_1 = require("@discordjs/builders");
const OPs_Vars_json_1 = require("../../Subsystems/Operations/OPs_Vars.json");
//Globals
const data = new builders_1.SlashCommandBuilder()
    .setName('status')
    .setDescription('Displays a list of the songs in the playlist.');
//Functions
async function execute(LCARS47, int) {
    let member, vChannel;
    try {
        member = await LCARS47.PLDYN.members.fetch(int.user.id);
    }
    catch (noUserErr) {
        return int.reply({
            content: 'No data could be found on your user. Process terminated.',
            ephemeral: true
        });
    }
    try {
        if (!member.voice || !member.voice.channel) {
            return int.reply({
                content: 'User must be attached to a valid voice channel.',
                ephemeral: true
            });
        }
        else {
            await displayQueue(LCARS47, int);
        }
    }
    catch (noVoiceErr) {
        return int.reply({
            content: 'Error retrieving valid voice channel. Process terminated.',
            ephemeral: true
        });
    }
}
async function displayQueue(LCARS47, int) {
    let queueList;
    let songList = '';
    if (LCARS47.MEDIA_QUEUE.has(OPs_Vars_json_1.PLDYNID)) {
        queueList = LCARS47.MEDIA_QUEUE.get(OPs_Vars_json_1.PLDYNID)?.songs;
        if (!queueList)
            return int.reply({ content: 'No media in queue.' });
    }
    else {
        return int.reply({
            content: 'No media in queue.'
        });
    }
    for (const song of queueList) {
        songList += `**${song.title}** - *${song.info.videoDetails.author}* (${song.durationFriendly})\n`;
    }
    return int.reply({
        content: '**__Player Queue__**\n' + songList
    });
}
function help() {
    return 'Displays the list of songs in the playlist.';
}
//Exports
exports.default = {
    name: 'Status',
    data,
    execute,
    help
};
