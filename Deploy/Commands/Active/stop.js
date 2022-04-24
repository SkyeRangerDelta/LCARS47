"use strict";
// -- STOP --
//Halts and disconnects the media player
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const builders_1 = require("@discordjs/builders");
const SysUtils_1 = __importDefault(require("../../Subsystems/Utilities/SysUtils"));
const OPs_Vars_json_1 = require("../../Subsystems/Operations/OPs_Vars.json");
const voice_1 = require("@discordjs/voice");
//Functions
const data = new builders_1.SlashCommandBuilder()
    .setName('stop')
    .setDescription('Halts and disconnects the media player.');
async function execute(LCARS47, int) {
    SysUtils_1.default.log('info', '[MEDIA-PLAYER] Received a stop command.');
    const serverQueue = LCARS47.MEDIA_QUEUE.get(OPs_Vars_json_1.PLDYNID);
    if (!serverQueue) {
        return int.reply('Nothing is playing at the moment.');
    }
    let member;
    try {
        member = await LCARS47.PLDYN.members.fetch(int.user.id);
    }
    catch (noMember) {
        throw 'Couldnt the calling member!';
    }
    try {
        if (!member.voice || !member.voice.channel) {
            return int.reply('Youre not connected to a voice channel!');
        }
        else if (member.voice.channel !== serverQueue.voiceChannel) {
            return int.reply('You need to call this from the player channel!');
        }
        const connection = (0, voice_1.getVoiceConnection)(OPs_Vars_json_1.PLDYNID);
        connection?.destroy();
        LCARS47.MEDIA_QUEUE.delete(OPs_Vars_json_1.PLDYNID);
        return int.reply('Disconnected!');
    }
    catch (endErr) {
        throw `Failed to terminate player.\n${endErr}`;
    }
}
function help() {
    return 'Halts and disconnects the media player.';
}
//Exports
exports.default = {
    name: 'Stop',
    data,
    execute,
    help
};
