"use strict";
// -- System Client --
// Handles the start of a client
Object.defineProperty(exports, "__esModule", { value: true });
exports.LCARS47 = void 0;
//Imports
const discord_js_1 = require("discord.js");
//Exports
exports.LCARS47 = new discord_js_1.Client({
    intents: [
        discord_js_1.Intents.FLAGS.GUILDS,
        discord_js_1.Intents.FLAGS.GUILD_MEMBERS,
        discord_js_1.Intents.FLAGS.GUILD_VOICE_STATES,
        discord_js_1.Intents.FLAGS.GUILD_MESSAGES,
        discord_js_1.Intents.FLAGS.GUILD_MESSAGE_TYPING
    ]
});
