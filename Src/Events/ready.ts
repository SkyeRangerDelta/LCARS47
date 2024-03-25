// -- READY EVENT --

//Imports
import Utility from '../Subsystems/Utilities/SysUtils.js';
import {LCARSClient} from "../Subsystems/Auxiliary/LCARSClient.js";
import RDS from "../Subsystems/RemoteDS/RDS_Utilities.js";
import envChecks from "../Subsystems/Auxiliary/EnvChecks.json"

import {ActivityType, TextChannel} from "discord.js";
import { JellyfinClient } from "../Subsystems/Auxiliary/JellyfinClient.js";
import { initRDS } from "../Subsystems/RemoteDS/RDS_Init";

const PLDYNID = process.env.PLDYNID as string;
const LCARSID = process.env.LCARSID as string;
const ENGINEERING = process.env.ENGINEERING as string;

//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute: async (LCARS47: LCARSClient) => {
        //Check for test mode
        if (process.argv.includes('test')) {
            Utility.log('info', '[CLIENT] Test mode enabled, running dev environment parameters.');
            LCARS47.TEST_MODE = true;
        }
        else {
            LCARS47.TEST_MODE = false;
        }

        //Heartbeat check
        LCARS47.HEARTBEAT = process.argv.includes('heartbeat');

        //Perform ENV checks
        for (const reqEnv of envChecks.env_required) {
            if (!process.env[reqEnv]) {
                Utility.log('error', `[CLIENT] Missing required ENV variable: ${reqEnv}`);
                process.exit(2);
            }
        }

        for (const optEnv of envChecks.env_optional) {
            if (!process.env[optEnv]) {
                Utility.log('warn', `[CLIENT] Missing optional ENV variable: ${optEnv}`);
            }
        }

        //Run RDS connection and check integrity
        LCARS47.RDS_CONNECTION = await RDS.rds_connect();
        await initRDS(LCARS47.RDS_CONNECTION);

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
            SESSION_UPTIME: {},
            STARTUP_TIME: "",
            STARTUP_UTC: 0,
            STATE: false,
            VERSION: ""
        };

        LCARS47.JELLYFIN_CLIENT = new JellyfinClient();

        const version = process.env.VERSION as string;

        Utility.log('proc', '[CLIENT] System boot reached READY.');
        Utility.log('proc', `[CLIENT] Current Stardate: ${Utility.stardate()}`);

        //If this was a boot check - exit
        if (LCARS47.HEARTBEAT) {
            Utility.log('info', '[CLIENT] Heartbeat check complete.');
            process.exit(1);
        }

        LCARS47.user?.setPresence({
            activities: [{ name: 'for stuff | V' + version, type: ActivityType.Listening }],
            status: 'online'
        });

        Utility.log('info', '[CLIENT] Getting old metrics page.');
        const oldBotData = await RDS.rds_getStatusFull(LCARS47.RDS_CONNECTION);

        Utility.log('info', '[CLIENT] Sending updated metrics page.');
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