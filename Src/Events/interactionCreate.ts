// -- INTERACTION EVENT --

//Imports
import {Interaction} from 'discord.js';
import {LCARSClient} from "../Subsystems/Auxiliary/LCARSClient.js";
import Utility from "../Subsystems/Utilities/SysUtils.js";
import RDS_Utilities from "../Subsystems/RemoteDS/RDS_Utilities.js";

//Exports
export default {
    name: 'interactionCreate',
    async execute(LCARS47: LCARSClient, int: Interaction) {
        if (!int.isCommand()) return;

        const cmd = LCARS47.CMD_INDEX.get(int.commandName);
        if (!cmd) return int.reply('No command!');

        try {
            Utility.log('info', `[CMD-HANDLER] New command received. (${int.commandName})`);
            await cmd.execute(LCARS47, int);

            //Command done, update stats
            await RDS_Utilities.rds_update(LCARS47.RDS_CONNECTION, 'rds_status', {id: 1}, {$inc: {CMD_QUERIES: 1}});
        }
        catch (cmdErr) {
            if (!int) {
                return;
            }
            else if (int.deferred || int.replied) {
                await int.followUp(`*Bzzt* Sector Failure!\n${cmdErr}`);
                Utility.log('err', `[INT-HANDLER] Cmd execution failed!\n${cmdErr}`);

                //Command failed, update stats
                await RDS_Utilities.rds_update(LCARS47.RDS_CONNECTION, 'rds_status', {id: 1}, {$inc: {CMD_QUERIES_FAILED: 1}});
            }
            else {
                await int.reply('Looks like something is busted on the subnet.\n' + cmdErr as string);

                //Command failed, update stats
                await RDS_Utilities.rds_update(LCARS47.RDS_CONNECTION, 'rds_status', {id: 1}, {$inc: {CMD_QUERIES_FAILED: 1}});
            }
        }
    }
}