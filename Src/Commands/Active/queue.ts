// -- QUEUE --
// Displays the list of songs currently playing

//Imports
import {SlashCommandBuilder} from "@discordjs/builders";
import {LCARSClient} from "../../Subsystems/Auxiliary/LCARSClient";
import {CommandInteraction} from "discord.js";
import {PLDYNID} from "../../Subsystems/Operations/OPs_IDs.json";
import Utility from "../../Subsystems/Utilities/SysUtils";
import {convertDuration} from "../../Subsystems/Utilities/MediaUtils";

//Globals
const data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Displays a list of the songs in the playlist.');

//Functions
async function execute(LCARS47: LCARSClient, int: CommandInteraction): Promise<void> {
    Utility.log('info', '[MEDIA-PLAYER] Received a queue request.');

    let member;
    try {
        member = await LCARS47.PLDYN.members.fetch(int.user.id)
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

async function displayQueue(LCARS47: LCARSClient, int: CommandInteraction) {
    let queueList;
    let songList = '';
    let totalDuration = 0;

    if (LCARS47.MEDIA_QUEUE.has(PLDYNID)) {
        queueList = LCARS47.MEDIA_QUEUE.get(PLDYNID)?.songs;

        if (!queueList) return int.reply({content: 'No media in queue.'});
    }
    else {
        return int.reply({
            content: 'No media in queue.'
        });
    }

    for (const song of queueList) {
        songList += `**${song.title}** - *${song.info.videoDetails.author.name}* (${song.durationFriendly})\n`;
        totalDuration += song.duration;
    }

    return int.reply({
        content: `**__Player Queue__** (${convertDuration(totalDuration)})\n${songList}`
    });
}

function help(): string {
    return 'Displays the list of songs in the playlist.'
}

//Exports
export default {
    name: 'Status',
    data,
    execute,
    help
}