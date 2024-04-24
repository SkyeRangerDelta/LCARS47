// -- STATUS --

// Imports
import { type ChatInputCommandInteraction, type Message } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';

import https from 'https';

import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { type Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';

// Functions
const data = new SlashCommandBuilder()
  .setName( 'jwst' )
  .setDescription( 'Accesses the James Webb Space Telescope API.' );

data.addSubcommand( s => s
  .setName( 'status' )
  .setDescription( 'Retrieves version/status data about the JWST API.' )
);

data.addSubcommand( s => s
  .setName( 'random' )
  .setDescription( 'Pulls a random image from MAST from a specific JWST program.' )
  .addIntegerOption( o => o
    .setName( 'program-id' )
    .setDescription( 'The ID of the JWST program to pull from.' )
    .addChoices( [['NGC 3324 (Carina)', 2731], ["Stephan's Quintet", 2732], ['NGC 3132 (Southern Ring Nebula)', 2733], ['WASP-96b & HAT-P-18b Exoplanets', 2734]] )
    .setRequired( true )
  )
);

async function execute ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<void> {
  Utility.log( 'info', '[JWST] Received a JWST inquiry command.' );
  await int.deferReply();

  const cmd = int.options.getSubcommand();
  Utility.log( 'info', `[JWST] Processing ${cmd} query...` );

  switch ( cmd ) {
    case 'status':
      await doJWSTRequest( '/', int );
      break;
    case 'random':
      await doJWSTRequest( `/program/id/${int.options.getInteger( 'program-id' )}`, int );
      break;
    default:
      break;
  }
}

async function doJWSTRequest ( reqPath: string, int: ChatInputCommandInteraction ): Promise<void> {
  if ( int.options.getSubcommand() === 'status' ) {
    const options = {
      method: 'GET',
      hostname: 'api.jwstapi.com',
      path: reqPath,
      headers: {},
      maxRedirects: 20
    };

    const req = https.request( options, ( res ) => {
      Utility.log( 'info', '[JWST] Sending REQ.' );

      res.on( 'data', ( chunk: Buffer ) => {
        Utility.log( 'info', '[JWST] Request Data:\n' + chunk.toString() );
        const data = JSON.parse( chunk.toString() );
        if ( data.statusCode === 401 ) {
          void int.editReply( {
            content: 'Reject: Invalid API key.'
          } );
        }
        else if ( data.statusCode === 200 ) {
          void int.editReply( {
            content: data.body
          } );
        }
      } );

      res.on( 'end', () => {
        Utility.log( 'info', '[JWST] Request Ended.' );
      } );

      res.on( 'error', ( err ) => {
        Utility.log( 'err', '[JWST] Request Error:\n' + err.message );
      } );
    } );

    req.end();
  }
  else {
    const options = {
      method: 'GET',
      hostname: 'api.jwstapi.com',
      path: reqPath,
      headers: {
        'X-API-KEY': process.env.JWST
      },
      maxRedirects: 20
    };

    const chunks: Buffer[] = [];

    const req = https.request( options, ( res ) => {
      Utility.log( 'info', `[JWST] Sending REQ (${options.hostname + options.path}).` );

      res.on( 'data', ( chunk: Buffer ) => {
        Utility.log( 'info', '[JWST] Receiving additional chunks.' );
        chunks.push( chunk );
      } );

      res.on( 'end', () => {
        Utility.log( 'info', '[JWST] Request Ended.' );
        const resData = Buffer.concat( chunks );
        const data = JSON.parse( resData.toString() );
        const records = [];

        for ( const entry in data.body ) {
          if ( data.body[entry].file_type === 'jpg' ) {
            records.push( data.body[entry] );
          }
        }

        const rEntryIndex = Math.floor( Math.random() * records.length );
        const rEntry = records[rEntryIndex];

        void int.editReply( {
          content: `[${rEntry.program}] ${rEntry.id}\nDesc: ${rEntry.details.description}`,
          files: [`${rEntry.location}`]
        } ).then( ( msg: Message ) => {
          console.log( 'JWST message edited.' );
        } );
      } );

      res.on( 'error', ( err ) => {
        Utility.log( 'err', '[JWST] Request Error:\n' + err.message );
      } );
    } );

    req.end();
  }
}

function help (): string {
  return 'Accesses the James Webb Space Telescope API.';
}

// Exports
export default {
  name: 'jwst',
  data,
  execute,
  help
} satisfies Command;
