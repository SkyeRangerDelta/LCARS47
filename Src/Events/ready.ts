// -- READY EVENT --

//Imports
import Utility from '../Subsystems/Utilities/SysUtils.js';
import {LCARSClient} from "../Subsystems/Auxiliary/LCARSClient.js";
import RDS from "../Subsystems/RemoteDS/RDS_Utilities.js";

import { version } from "../../package.json";

import {ActivityType, TextChannel} from "discord.js";
import { StatusInterface } from "../Subsystems/Auxiliary/StatusInterface.js";

const PLDYNID = process.env.PLDYNID as string;
const LCARSID = process.env.LCARSID as string;
const ENGINEERING = process.env.ENGINEERING as string;

//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute: async (LCARS47: LCARSClient, args?: string[]) => {
        LCARS47.PLDYN = await LCARS47.guilds.fetch(PLDYNID);
        LCARS47.MEMBER = await LCARS47.PLDYN.members.fetch(LCARSID);
        LCARS47.MEDIA_QUEUE = new Map();
        LCARS47.CLIENT_STATS = {
            CLIENT_MEM_USAGE: 0,
            CMD_QUERIES: 0,
            CMD_QUERIES_FAILED: 0,
            DS_API_LATENCY: 0,
            MEDIA_PLAYER_DATA: {},
            MEDIA_PLAYER_STATE: false,
            QUERIES: 0,
            SESSION: 0,
            SESSION_UPTIME: 0,
            STARTUP_TIME: "",
            STARTUP_UTC: 0,
            VERSION: "",
            STATE: false
        };

        console.log(process.argv);

        if (process.argv.includes('--heartbeat')) {
            Utility.log('info', '[CLIENT] Heartbeat only.');
            await LCARS47.destroy();
            return process.exit(0)
        }

        LCARS47.RDS_CONNECTION = await RDS.rds_connect();

        Utility.log('proc', '[CLIENT] IM ALIVE!');
        Utility.log('proc', `[CLIENT] Current Stardate: ${Utility.stardate()}`);

        // @ts-ignore
        LCARS47.user.setPresence({
            activities: [{ name: 'for stuff | V' + version, type: ActivityType.Listening }],
            status: 'online'
        });

        Utility.log('info', '[CLIENT] Getting old stats page.');
        const oldBotData = await RDS.rds_getStatusFull(LCARS47.RDS_CONNECTION);

        Utility.log('info', '[CLIENT] Sending updated stats page.');
        const startTime = Utility.flexTime();
        const startUTC = Date.now();
        const updateData = {
            $set: {
                STATE: true,
                VERSION: version,
                STARTUP_TIME: startTime,
                STARTUP_UTC: startUTC
            },
            $inc: {
                SESSION: 1,
                QUERIES: 1
            }
        };

        const lastStartTime = Utility.formatMSDiff(oldBotData.STARTUP_UTC);
        Utility.log('info', '[CLIENT] Time since last boot sequence:\n' + lastStartTime);

        const res = await RDS.rds_update(LCARS47.RDS_CONNECTION, 'rds_status', {id: 1}, updateData);
        if (!res) {
            throw 'RDS status update failed!';
        }

        const engineeringLog = await LCARS47.PLDYN.channels.fetch(ENGINEERING) as TextChannel;
        engineeringLog.send(`LCARS47 V${version} is ONLINE.`);
    }
};