/////////////////////////////////////////////
//              LCARS47
//   The Official PlDyn Discord Bot
//
//      Developed and Maintained
//          By SkyeRangerDelta
//-------------------------------------------
//      See https://pldyn.net
//  And blog: https://cf.pldyn.net/
//   Wiki: https://wiki.pldyn.net/
//
//  This is a custom bot designed for the
//      Planetary Dynamics Development
//              Community
/////////////////////////////////////////////

// -- DEPENDENCIES --
//Libraries
import dotenv from 'dotenv';
dotenv.config();

//Subsystems
import { LCARS47 } from './Subsystems/Operations/OPs_CoreClient';
import EventsIndexer from "./Subsystems/Operations/OPs_EventIndexer";
import CommandIndexer from "./Subsystems/Operations/OPs_CmdHandler";
import {Collection} from "discord.js";

// -- INIT --
// Index Events
EventsIndexer.indexEvents(LCARS47).then(() => {
    LCARS47.CMD_INDEX = new Collection();
    CommandIndexer.indexCommands(LCARS47);
});

// -- CORE --
LCARS47.login(process.env[`TOKEN`]).then(() => {
    console.log('Logged in!');
});