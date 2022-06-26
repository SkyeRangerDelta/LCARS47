// -- STOP --
//Halts and disconnects the media player

//Imports
import {SlashCommandBuilder} from "@discordjs/builders";
import {LCARSClient} from "../../Subsystems/Auxiliary/LCARSClient";
import Utility from "../../Subsystems/Utilities/SysUtils";
import {CommandInteraction, GuildMember, VoiceChannel} from "discord.js";
import {PLDYNID} from "../../Subsystems/Operations/OPs_IDs.json";
import {getVoiceConnection} from "@discordjs/voice";

//Functions
const data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Halts and disconnects the media player.');

async function execute(LCARS47: LCARSClient, int: CommandInteraction): Promise<void> {
    Utility.log('info', '[MEDIA-PLAYER] Received a stop command.');

    const serverQueue = LCARS47.MEDIA_QUEUE.get(PLDYNID);
    if (!serverQueue) {
        return int.reply('Nothing is playing at the moment.');
    }

    let member: GuildMember;

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

        const connection = getVoiceConnection(PLDYNID);
        connection?.destroy();
        LCARS47.MEDIA_QUEUE.delete(PLDYNID);
        return int.reply('Disconnected!');
    }
    catch (endErr) {
        throw `Failed to terminate player.\n${endErr}`;
    }
}

function help(): string {
    return 'Halts and disconnects the media player.';
}

//Exports
export default {
    name: 'Stop',
    data,
    execute,
    help
}