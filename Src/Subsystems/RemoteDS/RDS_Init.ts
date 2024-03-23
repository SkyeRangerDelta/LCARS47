// Remote Data Store Initialization

//Imports
import Utility from "../Utilities/SysUtils.js";
import { LCARS47 } from "../Operations/OPs_CoreClient";
import RDS from "./RDS_Utilities";
import { MongoClient } from "mongodb";


//Exports


//Functions
export async function initRDS(RDS_CONNECTION: MongoClient) {
    if (LCARS47.TEST_MODE) {
        Utility.log('info', '[RDS] Test mode enabled, running dev environment parameters.');
        await devIntegrityCheck(RDS_CONNECTION);
    }
    else {
        Utility.log('info', '[RDS] Running integrity check...');
        await integrityCheck(RDS_CONNECTION);
    }
}

async function devIntegrityCheck(RDS_CONNECTION: MongoClient) {
    Utility.log('info', '[RDS] Running dev RDS integrity check...');
}

async function integrityCheck(RDS_CONNECTION: MongoClient) {
    Utility.log('info', '[RDS] Running RDS integrity check...');
}