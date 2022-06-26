"use strict";
// -- INTERACTION EVENT --
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const SysUtils_1 = __importDefault(require("../Subsystems/Utilities/SysUtils"));
//Exports
exports.default = {
    name: 'interactionCreate',
    async execute(LCARS47, int) {
        if (!int.isCommand())
            return;
        const cmd = LCARS47.CMD_INDEX.get(int.commandName);
        if (!cmd)
            return int.reply('No command!');
        try {
            SysUtils_1.default.log('info', `[CMD-HANDLER] New command received. (${int.commandName})`);
            await cmd.execute(LCARS47, int);
        }
        catch (cmdErr) {
            if (!int) {
                return;
            }
            else if (int.deferred || int.replied) {
                await int.followUp('IM ON BLOODY FIRE!');
                SysUtils_1.default.log('err', `[INT-HANDLER] Cmd execution failed!\n${cmdErr}`);
            }
            else {
                await int.reply('Looks like something is busted on the subnet.\n' + cmdErr);
            }
        }
    }
};
