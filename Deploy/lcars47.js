"use strict";
/////////////////////////////////////////////
//              LCARS47
//   The Official PlDyn Discord Bot
//
//      Developed and Maintained
//          By SkyeRangerDelta
//-------------------------------------------
//      See https://pldyn.net
//  And blog: https://cf.pldyn.net/
//   Wiki: https://wiki.pldyn.net/
//
//  This is a custom bot designed for the
//      Planetary Dynamics Development
//              Community
/////////////////////////////////////////////
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// -- DEPENDENCIES --
//Libraries
const dotenv_1 = __importDefault(require("dotenv"));
//Subsystems
const OPs_CoreClient_1 = require("./Subsystems/Operations/OPs_CoreClient");
const OPs_EventIndexer_1 = __importDefault(require("./Subsystems/Operations/OPs_EventIndexer"));
const OPs_CmdHandler_1 = __importDefault(require("./Subsystems/Operations/OPs_CmdHandler"));
const discord_js_1 = require("discord.js");
// -- GLOBALS --
dotenv_1.default.config();
// -- INIT --
// Index Events
OPs_EventIndexer_1.default.indexEvents(OPs_CoreClient_1.LCARS47).then(() => {
    OPs_CoreClient_1.LCARS47.CMD_INDEX = new discord_js_1.Collection();
    OPs_CmdHandler_1.default.indexCommands(OPs_CoreClient_1.LCARS47);
});
// -- CORE --
OPs_CoreClient_1.LCARS47.login(process.env.TOKEN).then(() => {
    console.log('Logged in!');
});
