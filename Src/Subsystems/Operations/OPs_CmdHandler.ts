// -- COMMAND HANDLER --

//Imports
import * as fs from "fs";
import Utility from "../Utilities/SysUtils";
import path from "path";
import {LCARSClient} from "../Auxiliary/LCARSClient";
import {REST} from "@discordjs/rest";
import {PLDYNID, LCARSID, MEDIALOG} from './OPs_IDs.json';
import {Routes} from "discord-api-types/v9";

//Exports
const CommandIndexer = {
    indexCommands
};

export default CommandIndexer;

//Functions
async function indexCommands(LCARS47: LCARSClient): Promise<void> {
    const cmdJSON: object[] = [];

    const cmdPath = path.join(__dirname, '../..', 'Commands/Active');
    const commandIndex = fs.readdirSync(cmdPath).filter(f => f.endsWith('.js'));
    for (const command of commandIndex) {
        const cPath = `../../Commands/Active/${command}`;
        await import (cPath).then(c => {
            const cmd = c.default;
            Utility.log('info', `[CMD-INDEXER] Indexing ${cmd.name}`);
            cmdJSON.push(cmd.data.toJSON());
            LCARS47.CMD_INDEX.set(cmd.data.name, cmd);
        });
    }

    Utility.log('warn', '[CMD-INDEXER] Starting command registration update.');
    const rest = new REST({ version: '9' }).setToken(process.env.TOKEN as string);
    try {
        await rest.put(
            Routes.applicationGuildCommands(
                LCARSID as string,
                PLDYNID as string
            ),
            { body: cmdJSON}
        );
        Utility.log('warn', '[CMD-INDEXER] Finished command registration update.');
    }
    catch (cmdIndexErr) {
        Utility.log('err', '[CMD-INDEXER] ERROR REGISTERING/UPDATING SLASH COMMANDS!\n' + cmdIndexErr);
        LCARS47.destroy();
        process.exit();
    }
}