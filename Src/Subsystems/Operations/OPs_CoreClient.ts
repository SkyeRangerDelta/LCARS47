// -- System Client --
// Handles the start of a client

//Imports
import {Client, Intents} from 'discord.js';
import {LCARSClient} from "../Auxiliary/LCARSClient";

//Exports
export const LCARS47 = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.GUILD_VOICE_STATES,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_TYPING
    ]
}) as LCARSClient;