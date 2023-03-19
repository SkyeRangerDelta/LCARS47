// -- STATUS --

//Imports
import {ChatInputCommandInteraction, CommandInteraction, InteractionResponse} from "discord.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import {LCARSClient} from "../../Subsystems/Auxiliary/LCARSClient";

import RDS_Utilities from "../../Subsystems/RemoteDS/RDS_Utilities";
import Utility from "../../Subsystems/Utilities/SysUtils";

//Functions
const data = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Displays a report of all LCARS47s system states and session variables.');

async function execute(LCARS47: LCARSClient, int: ChatInputCommandInteraction): Promise<InteractionResponse | void> {
    Utility.log('info', '[AUXILIARY] Received status display request.');

    const trData = {
        coll: 'rds_status',
        key: 'selectAll'
    }

    const statusRP = await RDS_Utilities.rds_selectOne(LCARS47.RDS_CONNECTION, 'rds_status', 1);

    // @ts-ignore
    await int.reply({content: `LCARS RDS Status Report:\nState: ${statusRP.status}\nQueries: ${statusRP.queries}`});
}

function help(): string {
    return 'Displays a report of all LCARS47s system states and session variables.';
}

//Exports
export default {
    name: 'Status',
    data,
    execute,
    help
};