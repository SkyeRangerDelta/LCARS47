"use strict";
// -- SKIP --
// Moves media player to next song in queue.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const builders_1 = require("@discordjs/builders");
const SysUtils_1 = __importDefault(require("../../Subsystems/Utilities/SysUtils"));
const OPs_Vars_json_1 = require("../../Subsystems/Operations/OPs_Vars.json");
const play_1 = __importDefault(require("./play"));
//Globals
const data = new builders_1.SlashCommandBuilder()
    .setName('skip')
    .setDescription('Moves the music player on to the next song in queue (if any).');
//Functions
async function execute(LCARS47, int) {
    SysUtils_1.default.log('info', '[MEDIA-PLAYER] Received a skip command.');
    const serverQueue = LCARS47.MEDIA_QUEUE.get(OPs_Vars_json_1.PLDYNID);
    if (!serverQueue) {
        return int.reply('Nothing is playing at the moment.');
    }
    let member;
    try {
        member = await LCARS47.PLDYN.members.fetch(int.user.id);
    }
    catch (noMember) {
        throw 'Couldnt locate the calling member!';
    }
    try {
        if (!member.voice || !member.voice.channel) {
            return int.reply('Youre not connected to a voice channel!');
        }
        else if (member.voice.channel !== serverQueue.voiceChannel) {
            return int.reply('You need to call this from the player channel!');
        }
        await play_1.default.handleSongEnd(LCARS47.MEDIA_QUEUE, serverQueue);
        return int.reply({
            content: 'Queue skipped forward.'
        });
    }
    catch (endErr) {
        throw `Failed to terminate player.\n${endErr}`;
    }
}
function help() {
    return 'Moves media player on to the next song in the queue (if any).';
}
//Exports
exports.default = {
    name: 'Skip',
    data,
    execute,
    help
};
