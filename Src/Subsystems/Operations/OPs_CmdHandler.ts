// -- COMMAND HANDLER --

// Imports
import * as fs from 'fs';
import Utility from '../Utilities/SysUtils.js';
import path from 'path';
import { type LCARSClient } from '../Auxiliary/LCARSClient.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { type Command } from '../Auxiliary/Interfaces/CommandInterface';

const PLDYNID = process.env.PLDYNID;
const LCARSID = process.env.LCARSID;
const MEDIALOG = process.env.MEDIALOG;
const TOKEN = process.env.TOKEN;

// Exports
const CommandIndexer = {
  indexCommands
};

export default CommandIndexer;

// Functions
async function indexCommands ( LCARS47: LCARSClient ): Promise<void> {
  if ( ( PLDYNID == null ) || ( LCARSID == null ) || ( MEDIALOG == null ) || ( TOKEN == null ) ) {
    throw new Error( 'One or more environment variables are missing.' );
  }

  const cmdJSON: object[] = [];

  const cmdPath = path.join( __dirname, '../..', 'Commands/Active' );
  const commandIndex = fs.readdirSync( cmdPath ).filter( f => f.endsWith( '.js' ) );
  for ( const command of commandIndex ) {
    const cPath = `../../Commands/Active/${command}`;
    await import ( cPath ).then( (c: { default: Command }) => {
      const cmd: Command = c.default;
      Utility.log( 'info', `[CMD-INDEXER] Indexing ${cmd.name}` );
      cmdJSON.push( cmd.data.toJSON() );
      LCARS47.CMD_INDEX.set( cmd.data.name, cmd );
    } );
  }

  Utility.log( 'warn', '[CMD-INDEXER] Starting command registration update.' );
  const rest = new REST( { version: '9' } ).setToken( TOKEN );
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        LCARSID,
        PLDYNID
      ),
      { body: cmdJSON }
    );
    Utility.log( 'warn', '[CMD-INDEXER] Finished command registration update.' );
  }
  catch ( cmdIndexErr: unknown ) {
    Utility.log( 'err', `[CMD-INDEXER] ERROR REGISTERING/UPDATING SLASH COMMANDS!\n${cmdIndexErr as string}` );
    await LCARS47.destroy();
    process.exit();
  }
}
