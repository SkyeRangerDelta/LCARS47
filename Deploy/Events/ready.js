"use strict";
// -- READY EVENT --
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const SysUtils_1 = __importDefault(require("../Subsystems/Utilities/SysUtils"));
const OPs_IDs_json_1 = require("../Subsystems/Operations/OPs_IDs.json");
const package_json_1 = require("../package.json");
//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute: async (LCARS47, args) => {
        LCARS47.PLDYN = await LCARS47.guilds.fetch(OPs_IDs_json_1.PLDYNID);
        LCARS47.MEMBER = await LCARS47.PLDYN.members.fetch(OPs_IDs_json_1.LCARSID);
        LCARS47.MEDIA_QUEUE = new Map();
        SysUtils_1.default.log('proc', '[CLIENT] IM ALIVE!');
        // @ts-ignore
        LCARS47.user.setPresence({
            activities: [{ name: 'for stuff | V' + package_json_1.version, type: 'WATCHING' }],
            status: 'online'
        });
    }
};
