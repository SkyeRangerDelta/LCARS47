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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// -- DEPENDENCIES --
//Libraries
const dotenv = __importStar(require("dotenv"));
//Subsystems
const OPs_CoreClient_1 = require("./Subsystems/Operations/OPs_CoreClient");
const OPs_EventIndexer_1 = __importDefault(require("./Subsystems/Operations/OPs_EventIndexer"));
const OPs_CmdHandler_1 = __importDefault(require("./Subsystems/Operations/OPs_CmdHandler"));
const discord_js_1 = require("discord.js");
// -- GLOBALS --
dotenv.config();
// -- INIT --
// Index Events
OPs_EventIndexer_1.default.indexEvents(OPs_CoreClient_1.LCARS47);
//Index/Register Commands
OPs_CoreClient_1.LCARS47.CMD_INDEX = new discord_js_1.Collection();
OPs_CmdHandler_1.default.indexCommands(OPs_CoreClient_1.LCARS47);
// -- CORE --
OPs_CoreClient_1.LCARS47.login(process.env.TOKEN);
