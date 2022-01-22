// -- STATUS --

//Imports
import {CommandInteraction} from "discord.js";
import {SlashCommandBuilder} from "@discordjs/builders";
import {LCARSClient} from "../../Subsystems/Auxiliary/LCARSClient";

//Functions
const data = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Displays a report of all LCARS47s system states and session variables.');

async function execute(LCARS47: LCARSClient, int: CommandInteraction): Promise<void> {
    await int.reply({content: 'Neat things here.'});
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