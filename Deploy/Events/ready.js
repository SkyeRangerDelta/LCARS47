"use strict";
// -- READY EVENT --
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const SysUtils_1 = __importDefault(require("../Subsystems/Utilities/SysUtils"));
const OPs_Vars_json_1 = require("../Subsystems/Operations/OPs_Vars.json");
const RDS_Utilities_1 = __importDefault(require("../Subsystems/RemoteDS/RDS_Utilities"));
//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute: async (LCARS47, args) => {
        LCARS47.PLDYN = await LCARS47.guilds.fetch(OPs_Vars_json_1.PLDYNID);
        LCARS47.MEMBER = await LCARS47.PLDYN.members.fetch(OPs_Vars_json_1.LCARSID);
        LCARS47.MEDIA_QUEUE = new Map();
        LCARS47.RDS_CONNECTION = await RDS_Utilities_1.default.rds_connect();
        SysUtils_1.default.log('proc', '[CLIENT] IM ALIVE!');
        // @ts-ignore
        LCARS47.user.setPresence({
            activities: [{ name: 'for stuff | V' + process.env.VERSION, type: 'WATCHING' }],
            status: 'online'
        });
        const engineeringLog = await LCARS47.PLDYN.channels.fetch(OPs_Vars_json_1.ENGINEERING);
        engineeringLog.send(`LCARS47 V${process.env.VERSION} is ONLINE.`);
    }
};
