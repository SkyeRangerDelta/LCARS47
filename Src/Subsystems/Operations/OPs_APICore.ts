// -- API Core --

//Imports
import Utility from "../Utilities/SysUtils";
import { Client } from "discord.js";
import { Request, Response, Application } from "express";
import exp = require("express");
import { StatusInterface } from "../Auxiliary/StatusInterface";
import RDS_Utilities from "../RemoteDS/RDS_Utilities";
import { LCARSClient } from "../Auxiliary/LCARSClient";

//Exports
const APICore = {
    loadAPI
};

export default APICore;

//Functions
async function loadAPI(LCARS47: LCARSClient): Promise<void> {
    const rtr: Application = exp();

    rtr.get('/stats', async (req: Request, res: Response) => {
        Utility.log('info', '[API] Loading latest API Stats.');
        const botStats: StatusInterface = await RDS_Utilities.rds_getStatusFull(LCARS47.RDS_CONNECTION);
    });
}