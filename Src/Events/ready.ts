// -- READY EVENT --

//Imports
import Utility from '../Subsystems/Utilities/SysUtils';
import {LCARSClient} from "../Subsystems/Auxiliary/LCARSClient";
import { PLDYNID, LCARSID } from '../Subsystems/Operations/OPs_IDs.json';
import { version } from '../package.json';

//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute: async (LCARS47: LCARSClient, args?: string[]) => {
        LCARS47.PLDYN = await LCARS47.guilds.fetch(PLDYNID);
        LCARS47.MEMBER = await LCARS47.PLDYN.members.fetch(LCARSID);
        LCARS47.MEDIA_QUEUE = new Map();

        Utility.log('proc', '[CLIENT] IM ALIVE!');

        // @ts-ignore
        LCARS47.user.setPresence({
            activities: [{ name: 'for stuff | V' + version, type: 'WATCHING' }],
            status: 'online'
        });
    }
};