"use strict";
// -- PLAYING --
// Displays details about the currently playing song
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const builders_1 = require("@discordjs/builders");
const SysUtils_1 = __importDefault(require("../../Subsystems/Utilities/SysUtils"));
const OPs_Vars_json_1 = require("../../Subsystems/Operations/OPs_Vars.json");
//Globals
const data = new builders_1.SlashCommandBuilder()
    .setName('playing')
    .setDescription('Displays details about the currently playing song.');
//Functions
async function execute(LCARS47, int) {
    SysUtils_1.default.log('info', '[MEDIA-PLAYER] Received a song detail request.');
    let member;
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
            await displayPlaying(LCARS47, int);
        }
    }
    catch (noVoiceErr) {
        return int.reply({
            content: 'Error retrieving valid voice channel. Process terminated.',
            ephemeral: true
        });
    }
}
function displayPlaying(LCARS47, int) {
    let queueList;
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
    const songDetail = queueList[0];
    return int.reply({
        content: `__[${songDetail.title}](${songDetail.url})__\n` +
            `YT Channel: *${songDetail.info.videoDetails.author.name}*\n` +
            `Length: ${songDetail.durationFriendly}` +
            `Queued by: ${songDetail.member.displayName}`
    });
}
function help() {
    return 'Displays details about the currently playing song.';
}
//Exports
exports.default = {
    name: 'Playing',
    data,
    execute,
    help
};
