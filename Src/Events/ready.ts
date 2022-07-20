// -- READY EVENT --

//Imports
import Utility from '../Subsystems/Utilities/SysUtils';
import {LCARSClient} from "../Subsystems/Auxiliary/LCARSClient";
import {PLDYNID, LCARSID, ENGINEERING} from '../Subsystems/Operations/OPs_IDs.json';
import {VERSION} from '../Subsystems/Auxiliary/Aux_Version.json';
import RDS from "../Subsystems/RemoteDS/RDS_Utilities";

import {TextChannel} from "discord.js";

//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute: async (LCARS47: LCARSClient, args?: string[]) => {
        LCARS47.PLDYN = await LCARS47.guilds.fetch(PLDYNID);
        LCARS47.MEMBER = await LCARS47.PLDYN.members.fetch(LCARSID);
        LCARS47.MEDIA_QUEUE = new Map();

        LCARS47.RDS_CONNECTION = await RDS.rds_connect();

        Utility.log('proc', '[CLIENT] IM ALIVE!');

        // @ts-ignore
        LCARS47.user.setPresence({
            activities: [{ name: 'for stuff | V' + VERSION, type: 'WATCHING' }],
            status: 'online'
        });

        const engineeringLog = await LCARS47.PLDYN.channels.fetch(ENGINEERING) as TextChannel;
        engineeringLog.send(`LCARS47 V${process.env.VERSION} is ONLINE.`);
    }
};