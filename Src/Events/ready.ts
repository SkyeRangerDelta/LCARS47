// -- READY EVENT --

//Imports
import Utility from '../Subsystems/Utilities/SysUtils';
import {LCARSClient} from "../Subsystems/Auxiliary/LCARSClient";
import {PLDYNID, LCARSID, ENGINEERING} from '../Subsystems/Operations/OPs_IDs.json';
import RDS from "../Subsystems/RemoteDS/RDS_Utilities";

import {ActivityType, TextChannel} from "discord.js";
import { StatusInterface } from "../Subsystems/Auxiliary/StatusInterface";

//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute: async (LCARS47: LCARSClient, args?: string[]) => {
        LCARS47.PLDYN = await LCARS47.guilds.fetch(PLDYNID);
        LCARS47.MEMBER = await LCARS47.PLDYN.members.fetch(LCARSID);
        LCARS47.MEDIA_QUEUE = new Map();

        LCARS47.RDS_CONNECTION = await RDS.rds_connect();

        const version = process.env.VERSION as string;

        Utility.log('proc', '[CLIENT] IM ALIVE!');

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