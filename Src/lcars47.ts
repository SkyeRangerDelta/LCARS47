/////////////////////////////////////////////
//              LCARS47
//   The Official PlDyn Discord Bot
//
//      Developed and Maintained
//          By SkyeRangerDelta
//-------------------------------------------
//      See https://pldyn.net
//   Wiki: https://wiki.pldyn.net/
//
//  This is a custom bot designed for the
//      Planetary Dynamics Development
//              Community
/////////////////////////////////////////////

// -- DEPENDENCIES --
//Libraries
import { LCARS47Client } from "./Subsystems/Operations/OPs_CoreClient";
import APICore from "./Subsystems/Operations/OPs_APICore.js";
import Utility from "./Subsystems/Utilities/SysUtils.js";

import dotenv from 'dotenv';

/**
 * Initialize
 * - Load the environment variables
 * - Create the LCARS47 client
 */
dotenv.config();
const LCARS47 = new LCARS47Client();

/**
 * Runs the LCARS47 boot sequence.
 */
async function runLCARSInit() {
    await LCARS47.login(process.env.TOKEN as string);
    await LCARS47.doBoot();
}

runLCARSInit();

// -- CORE --
// LCARS47.login(process.env[`TOKEN`]).then(() => {
//     Utility.log('info', '[CLIENT] Core Online.')
// });

// -- API --
APICore.loadAPI(LCARS47).then(() => {
    Utility.log('info', '[CLIENT] API Online.')
});