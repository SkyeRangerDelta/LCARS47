// -- Guild Utilities --
// PlDyn low-priority task functions

// Imports
import { type Snowflake } from 'discord-api-types/globals';
import { type LCARSClient } from '../Auxiliary/LCARSClient';
import { type Message } from 'discord.js';
import Utility from './SysUtils';
import GPTCore from '../Operations/OPs_GPTCore';

// Types
interface SpecChannel {
  name: string
  id: string
}

// Globals
const specChannels: SpecChannel[] = readSpecChannels();

export default {
  isSpecChannel ( chID: Snowflake ): { name: string, id: string } | null {
    for ( const specChannel of specChannels ) {
      if ( chID === specChannel.id ) {
        return specChannel;
      }
    }

    return null;
  },
  async handleSpecResponse ( specData: string, LCARS47: LCARSClient, msg: Message ) {
    switch ( specData ) {
      case 'SIMLAB':
        await runSimData( LCARS47, msg, false );
        break;
      case 'ENGINEERING':
        runEngineering( msg );
        break;
      case 'MEDIALOG':
        runMediaData( msg );
        break;
      case 'DEVLAB':
        await runSimData( LCARS47, msg, true );
        break;
      default:
        Utility.log( 'warn', '[GUILD UTILS] Unkown spec channel handler type.' );
    }
  }
};

// Functions
async function runSimData ( LCARS47: LCARSClient, msg: Message, isAdv: boolean ): Promise<void> {
  if ( isAdv ) {
    Utility.log( 'proc', '[EVENT] [MSG-CREATE] Processing a new dev lab message.' );
  }
  else {
    Utility.log( 'proc', '[EVENT] [MSG-CREATE] Processing a new sim lab message.' );
  }
  if ( !msg.content.toLowerCase().startsWith( 'computer' ) ) return;

  Utility.log( 'proc', '[EVENT] [SIM-DATA] Handling a GPT request.' );
  const msgContent = msg.content.substring( 7 ).trim();

  await GPTCore.handleGPTReq( msg, msgContent, isAdv );
}

function runEngineering ( msg: Message ): void {
  Utility.log( 'proc', `[EVENT] [MSG-CREATE] Reached engineering deck event. Message: ${msg.content}` );
}

function runMediaData ( msg: Message ): void {
  Utility.log( 'proc', `[EVENT] [MSG-CREATE] Reached media log event.. Message: ${msg.content}` );
}

function readSpecChannels (): SpecChannel[] {
  const specChannels: SpecChannel[] = [];

  const simlab = process.env.SIMLAB;
  const engineering = process.env.ENGINEERING;
  const medialog = process.env.MEDIALOG;
  const devlab = process.env.DEVLAB;

  if ( simlab == null ) {
    throw new Error( 'SIMLAB channel ID not set.' );
  }
  else {
    specChannels.push( { name: 'SIMLAB', id: simlab } );
  }

  if ( engineering == null ) {
    throw new Error( 'ENGINEERING channel ID not set.' );
  }
  else {
    specChannels.push( { name: 'ENGINEERING', id: engineering } );
  }

  if ( medialog == null ) {
    throw new Error( 'MEDIALOG channel ID not set.' );
  }
  else {
    specChannels.push( { name: 'MEDIALOG', id: medialog } );
  }

  if ( devlab == null ) {
    throw new Error( 'DEVLAB channel ID not set.' );
  }
  else {
    specChannels.push( { name: 'DEVLAB', id: devlab } );
  }

  return specChannels;
}
