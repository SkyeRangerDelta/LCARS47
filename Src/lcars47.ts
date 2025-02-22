// //////////////////////////////////////////
//              LCARS47
//   The Official PlDyn Discord Bot
//
//      Developed and Maintained
//          By SkyeRangerDelta
// -------------------------------------------
//      See https://pldyn.net
//   Wiki: https://wiki.pldyn.net/
//
//  This is a custom bot designed for the
//      Planetary Dynamics Development
//              Community
// //////////////////////////////////////////

// -- DEPENDENCIES --
// Libraries
import { Collection } from 'discord.js';

// Subsystems
import './Subsystems/Utilities/EnvUtils';
import { LCARS47 } from './Subsystems/Operations/OPs_CoreClient.js';
import EventsIndexer from './Subsystems/Operations/OPs_EventIndexer.js';
import CommandIndexer from './Subsystems/Operations/OPs_CmdHandler.js';
import Utility from './Subsystems/Utilities/SysUtils.js';
import APICore from './Subsystems/Operations/OPs_APICore';

// Index Events
void EventsIndexer.indexEvents( LCARS47 ).then( () => {
  LCARS47.CMD_INDEX = new Collection();
  void CommandIndexer.indexCommands( LCARS47 );
} );

// -- CORE --
void LCARS47.login( process.env.TOKEN ).then( () => {
  Utility.log( 'info', '[CLIENT] Core Online.' );
} );

if ( !process.argv.includes( '--heartbeat' ) ) {
  // -- API --
  try {
    APICore.loadAPI( LCARS47 )
    Utility.log( 'info', '[CLIENT] API Online.' );
  }
  catch {
    Utility.log( 'error', '[CLIENT] API Offline.' );
  }
}
