// -- MESSAGE EVENT --

//Imports
import { Client, Message } from 'discord.js';
import Utility from "../Subsystems/Utilities/SysUtils";

//Exports
export default {
    name: 'messageCreate',
    execute: async (LCARS47: Client, msg: Message) => {
        if (msg.author.bot || (msg.author === LCARS47.user)) return;

        Utility.log('proc', '[EVENT] [MSG-CREATE] Here!');
    }
}
