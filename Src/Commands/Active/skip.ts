// -- SKIP --
// Moves media player to next song in queue.

//Imports
import {SlashCommandBuilder} from "@discordjs/builders";
import {LCARSClient} from "../../Subsystems/Auxiliary/LCARSClient.js";
import {ChatInputCommandInteraction, CommandInteraction, GuildMember, InteractionResponse} from "discord.js";
import Utility from "../../Subsystems/Utilities/SysUtils.js";

const PLDYNID = process.env.PLDYNID as string;

import PlayerUtils from "./play.js";

//Globals
const data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Moves the music player on to the next song in queue (if any).');

//Functions
async function execute(LCARS47: LCARSClient, int: ChatInputCommandInteraction): Promise<InteractionResponse | void> {
    Utility.log('info', '[MEDIA-PLAYER] Received a skip command.');

    const serverQueue = LCARS47.MEDIA_QUEUE.get(PLDYNID);
    if (!serverQueue) {
        return int.reply('Nothing is playing at the moment.');
    }

    let member: GuildMember;

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

        await PlayerUtils.handleSongEnd(LCARS47.MEDIA_QUEUE, serverQueue);

        return int.reply({
            content: 'Queue skipped forward.'
        });
    }
    catch (endErr) {
        throw `Failed to terminate player.\n${endErr}`;
    }
}

function help(): string {
    return 'Moves media player on to the next song in the queue (if any).';
}

//Exports
export default {
    name: 'Skip',
    data,
    execute,
    help
}