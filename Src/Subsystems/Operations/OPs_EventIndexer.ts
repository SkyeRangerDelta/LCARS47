// -- Events Indexer --

// Imports
import * as fs from 'fs';
import * as path from 'path';

import Utility from '../Utilities/SysUtils.js';
import { type Event } from '../Auxiliary/Interfaces/EventInterface';
import type { LCARSClient } from '../Auxiliary/LCARSClient';

// Exports
const EventsIndexer = {
  indexEvents
};

export default EventsIndexer;

// Functions
async function indexEvents ( LCARS47: LCARSClient ): Promise<void> {
  const evPath = path.join( __dirname, '../..', 'Events' );
  const eventsIndex = fs.readdirSync( evPath ).filter( f => f.endsWith( '.js' ) );
  for ( const event of eventsIndex ) {
    await import( `../../Events/${event}` ).then( ( e: { default: Event }) => {
      const ev: Event = e.default;
      Utility.log( 'info', `[EVENT-HANDLER] Indexing ${ev.name}` );
      if ( ev.once ) {
        LCARS47.once( ev.name, ( ...args: unknown[] ) => ev.execute( LCARS47, ...args ) );
      }
      else {
        LCARS47.on( ev.name, ( ...args: unknown[] ) => ev.execute( LCARS47, ...args ) );
      }
    } );
  }
}
