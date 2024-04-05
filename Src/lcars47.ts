/// //////////////////////////////////////////
//              LCARS47
//   The Official PlDyn Discord Bot
//
//      Developed and Maintained
//          By SkyeRangerDelta
// -------------------------------------------
//      See https://pldyn.net
//  And blog: https://cf.pldyn.net/
//   Wiki: https://wiki.pldyn.net/
//
//  This is a custom bot designed for the
//      Planetary Dynamics Development
//              Community
/// //////////////////////////////////////////

// -- DEPENDENCIES --
// Libraries
import dotenv from 'dotenv'

// Subsystems
import { LCARS47 } from './Subsystems/Operations/OPs_CoreClient.js'
import EventsIndexer from './Subsystems/Operations/OPs_EventIndexer.js'
import CommandIndexer from './Subsystems/Operations/OPs_CmdHandler.js'
import { Collection } from 'discord.js'
import APICore from './Subsystems/Operations/OPs_APICore.js'
import Utility from './Subsystems/Utilities/SysUtils.js'
dotenv.config()

// -- INIT --
// Index Events
EventsIndexer.indexEvents(LCARS47).then(() => {
  LCARS47.CMD_INDEX = new Collection()
  CommandIndexer.indexCommands(LCARS47)
})

// -- CORE --
LCARS47.login(process.env.TOKEN).then(() => {
  Utility.log('info', '[CLIENT] Core Online.')
})

// -- API --
APICore.loadAPI(LCARS47).then(() => {
  Utility.log('info', '[CLIENT] API Online.')
})
