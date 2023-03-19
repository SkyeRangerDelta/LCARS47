// -- PLAYING --
// Displays details about the currently playing song

//Imports
import {SlashCommandBuilder} from "@discordjs/builders";
import {LCARSClient} from "../../Subsystems/Auxiliary/LCARSClient";
import {
    CacheType,
    ChatInputCommandInteraction,
    CommandInteraction,
    GuildCacheMessage,
    InteractionResponse
} from "discord.js";
import Utility from "../../Subsystems/Utilities/SysUtils";
import {PLDYNID} from "../../Subsystems/Operations/OPs_IDs.json";

//Globals
const data = new SlashCommandBuilder()
    .setName('playing')
    .setDescription('Displays details about the currently playing song.');

//Functions
async function execute(LCARS47: LCARSClient, int: ChatInputCommandInteraction): Promise<InteractionResponse | void> {
    Utility.log('info', '[MEDIA-PLAYER] Received a song detail request.');

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

function displayPlaying(LCARS47: LCARSClient, int: ChatInputCommandInteraction) {
    let queueList;

    if (LCARS47.MEDIA_QUEUE.has(PLDYNID)) {
        queueList = LCARS47.MEDIA_QUEUE.get(PLDYNID)?.songs;

        if (!queueList) return int.reply({content: 'No media in queue.'});
    }
    else {
        return int.reply({
            content: 'No media in queue.'
        });
    }

    const songDetail = queueList[0];
    return int.reply({
        content: `__[${songDetail.title}](<${songDetail.url}>)__\n` +
            `YT Channel: *${songDetail.info.videoDetails.author.name}*\n` +
            `Length: ${songDetail.durationFriendly}\n` +
            `Queued by: ${songDetail.member.displayName}`
    });
}

function help(): string {
    return 'Displays details about the currently playing song.'
}

//Exports
export default {
    name: 'Playing',
    data,
    execute,
    help
}