// -- JELLYFIN --
// Does Jellyfin related things

//Imports
import {
    CacheType,
    ChatInputCommandInteraction,
    GuildCacheMessage,
    GuildMember,
    TextChannel,
    VoiceChannel
} from "discord.js";
import { LCARSClient } from "../../Subsystems/Auxiliary/LCARSClient.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import Utility from "../../Subsystems/Utilities/SysUtils.js";
import { BaseItemKind, SearchHint } from "@jellyfin/sdk/lib/generated-client";

//Functions
const data = new SlashCommandBuilder()
    .setName('jellyfin')
    .setDescription('Begins an audio stream from the Jellyfin Server.');

/*
data.addStringOption(o => o
    .setName('query')
    .setDescription('The name of the song/album/artist to play.')
    .setRequired(true));

data.addStringOption(o => o
    .setName('type')
    .setDescription('Set the type of search filter for the query.')
    .setChoices([
        [
            'Song', 'song'
        ],
        [
            'Album', 'album'
        ],
        [
            'Playlist', 'playlist'
        ]
    ]));
 */

async function execute(LCARS47: LCARSClient, int: ChatInputCommandInteraction): Promise<GuildCacheMessage<CacheType>>  {
    await int.deferReply();

    return int.editReply("Command doesn't work yet. Please ignore.");

    //Check for if YT Media Player is running
    if (LCARS47.CLIENT_STATS.MEDIA_PLAYER_STATE) return int.editReply('Cannot stream while another media queue is in process.');

    //let defaultReportChannel = await LCARS47.PLDYN.channels.fetch(MEDIALOG) as TextChannel;

    let member: GuildMember;
    let vChannel: VoiceChannel;

    try {
        member = await LCARS47.PLDYN.members.fetch(int.user.id);
    }
    catch (noUserErr) {
        console.log(noUserErr);
        return int.editReply('No user could be found!');
    }

    try {
        if (!member.voice || !member.voice.channel) {
            return int.editReply('You need to be in a voice channel first!');
        }
        else {
            vChannel = member.voice.channel as VoiceChannel;
            Utility.log('info', '[MEDIA-PLAYER] Received new play request for channel: ' + vChannel.name);
        }
    }
    catch (noVChannel) {
        return int.editReply('You need to be in a voice channel first!');
    }

    //Get Song Info
    let ARCHIVE: SearchHint | undefined;
    const query = int.options.getString('query') ?? '';
    if (query.startsWith('id-')) {
        //Query is a specific target already known
        return int.editReply('Currently not accepting native IDs.');
    }

    const type = int.options.getString('type') ?? 'all';
    const queryType = getType(type);
    // eslint-disable-next-line prefer-const
    ARCHIVE = await LCARS47.JELLYFIN_CLIENT.searchType(query, queryType);

    if (!ARCHIVE || undefined) {
        return int.editReply('Failed to find anything, check spelling?');
    }
    else {
        return int.editReply(`Located archive ${ARCHIVE?.Name} from ${ARCHIVE?.Album} by ${ARCHIVE?.AlbumArtist}`);
    }
}

function getType(queryType: string): BaseItemKind[] {
    const typeSelect: { [key: string]: BaseItemKind[] } = {
        'song': [BaseItemKind.Audio],
        'album': [BaseItemKind.MusicAlbum],
        'playlist': [BaseItemKind.Playlist],
        'all': [BaseItemKind.Audio, BaseItemKind.MusicAlbum, BaseItemKind.Playlist]
    }

    return typeSelect[queryType];
}

function help(): string {
    return 'Streams media from Jellyfin.'
}

//Exports
export default {
    name: 'jellyfin',
    data,
    execute,
    help
}