// -- API Core --

//Imports
import Utility from "../Utilities/SysUtils";
import { Application, Request, Response } from "express";
import { StatusInterface } from "../Auxiliary/StatusInterface";
import RDS_Utilities from "../RemoteDS/RDS_Utilities";
import { LCARSClient } from "../Auxiliary/LCARSClient";
import { PLDYNID } from "./OPs_IDs.json";
import exp = require("express");

//Exports
const APICore = {
    loadAPI
};

export default APICore;

//Variables
const API_PORT = process.env.API_PORT as unknown as number;
const API_HOST = process.env.API_HOST as string;

//Functions
async function loadAPI(LCARS47: LCARSClient): Promise<void> {
    const rtr: Application = exp();

    rtr.get('/stats', async (req: Request, res: Response) => {
        if (!LCARS47.isReady()) {
            return res.send({STATE: false});
        }

        Utility.log('info', '[API] Received a request for stats.')
        res.send(await buildStats(LCARS47));
    });

    rtr.listen(API_PORT, API_HOST, () => {
        Utility.log('info', `[API] Service online at ${API_HOST}:${API_PORT}`);
    })
}

async function buildStats(LCARS47: LCARSClient): Promise<StatusInterface> {
    Utility.log('info', '[API] Loading latest API Stats.');
    const botStats = await RDS_Utilities.rds_getStatusFull(LCARS47.RDS_CONNECTION);
    botStats.CLIENT_MEM_USAGE = Utility.formatProcess_mem(process.memoryUsage().heapUsed);
    botStats.DS_API_LATENCY = LCARS47.ws.ping;
    botStats.SESSION_UPTIME = Utility.formatMSDiff(botStats.STARTUP_UTC, true) as object;

    const mediaQueue = LCARS47.MEDIA_QUEUE.get(PLDYNID);
    botStats.MEDIA_PLAYER_STATE = !!mediaQueue;

    if (mediaQueue && mediaQueue.isPlaying) {
        botStats.MEDIA_PLAYER_DATA = mediaQueue.songs[0];
    }
    else {
        botStats.MEDIA_PLAYER_DATA = {
            info: 'Nothing playing.'
        }
    }

    return botStats;
}