// -- INTERACTION EVENT --

//Imports
import {Interaction} from 'discord.js';
import {LCARSClient} from "../Subsystems/Auxiliary/LCARSClient";
import Utility from "../Subsystems/Utilities/SysUtils";

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
        }
        catch (cmdErr) {
            if (!int) {
                return;
            }
            else if (int.deferred || int.replied) {
                await int.followUp('IM ON BLOODY FIRE!');
                Utility.log('err', `[INT-HANDLER] Cmd execution failed!\n${cmdErr}`);
            }
            else {
                await int.reply('Looks like something is busted on the subnet.\n' + cmdErr as string);
            }
        }
    }
}