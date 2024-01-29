// -- Guild Utilities --
// PlDyn low-priority task functions

//Imports
import { Snowflake } from "discord-api-types/globals";
import { LCARSClient } from "../Auxiliary/LCARSClient";
import { Message } from "discord.js";
import SysUtils from "./SysUtils";
import Utility from "./SysUtils";
import GPTCore from "../Operations/OPs_GPTCore";

//Exports

//Globals
const specChannels = [
    {name: "SIMLAB", id: process.env.SIMLAB!},
    {name: "ENGINEERING", id: process.env.ENGINEERING!},
    {name: "MEDIALOG", id: process.env.MEDIALOG!},
    {name: "DEVLAB", id: process.env.DEVLAB!}
];

export default {
    isSpecChannel(chID: Snowflake): {name: string, id: string} | null {
        for (const specChannel of specChannels) {
            if (chID == specChannel.id) {
                return specChannel;
            }
        }

        return null;
    },
    handleSpecResponse(specData: string, LCARS47: LCARSClient, msg: Message) {
        switch (specData) {
            case 'SIMLAB':
                runSimData(LCARS47, msg, false);
                break;
            case 'ENGINEERING':
                runEngineering(LCARS47, msg);
                break;
            case 'MEDIALOG':
                runMediaData(LCARS47, msg);
                break;
            case 'DEVLAB':
                runSimData(LCARS47, msg, true);
                break;
            default:
                SysUtils.log('warn', '[GUILD UTILS] Unkown spec channel handler type.');
        }
    }
}

//Functions
function runSimData(LCARS47: LCARSClient, msg: Message, isAdv: boolean) {
    if (isAdv) {
        Utility.log('proc', `[EVENT] [MSG-CREATE] Processing a new dev lab message.`);
    }
    else {
        Utility.log('proc', `[EVENT] [MSG-CREATE] Processing a new sim lab message.`);
    }
    if (!msg.content.toLowerCase().startsWith('computer')) return;

    Utility.log('proc', `[EVENT] [SIM-DATA] Handling a GPT request.`);
    const msgContent = msg.content.substring(7).trim();
    GPTCore.handleGPTReq(msg, msgContent, isAdv);
}

function runEngineering(LCARS47: LCARSClient, msg: Message) {
    Utility.log('proc', `[EVENT] [MSG-CREATE] Reached engineering deck event`);
    return;
}

function runMediaData(LCARS47: LCARSClient, msg: Message) {
    Utility.log('proc', `[EVENT] [MSG-CREATE] Reached media log event.`);
}