// Imports
import type { LCARSClient } from '../../Auxiliary/LCARSClient';
import exp from 'express';
import { getEnv } from '../../Utilities/EnvUtils';
import type { TextChannel } from 'discord.js';
import type { SendMessageBody } from '../APIInterfaces';

// Globals
const env = getEnv();

// Exports
const sendMessage = {
  name: 'sendMessage',
  router: loadRoute
}

export default sendMessage;


// Logic
function loadRoute( LCARS47: LCARSClient ) {
  const rtr = exp();

  rtr.post( '/sendMessage', async ( req, res ) => {
    if ( !req.header('x-lcars-auth') || req.header('x-lcars-auth') === '' ) {
      res.status( 401 ).send(
        { STATE: false, ERROR: 'Unauthorized: Missing authentication header.' }
      );
      return;
    }

    if ( req.header('x-lcars-auth') !== env.API_AUTH_TOKEN ) {
      res.status( 403 ).send(
        { STATE: false, ERROR: 'Forbidden: Invalid authentication token.' }
      );
      return;
    }

    try {
      console.log( req.body );

      const reqBody = req.body as SendMessageBody;
      const channelId = reqBody.channelId ?? '';
      const content = reqBody.content ?? '';

      if ( channelId === '' ) {
        res.status( 400 ).send(
          { ERROR: true, MESSAGE: 'Bad Request: Missing channelId in request body.' }
        );
        return;
      }

      if ( content === '' ) {
        res.status( 400 ).send(
          { ERROR: true, MESSAGE: 'Bad Request: Missing content in request body.' }
        );
        return;
      }

      const channel = await LCARS47.channels.fetch( channelId ) as TextChannel;
      if ( !channel || !channel.isTextBased() ) {
        res.status( 404 ).send(
          { STATE: false, ERROR: 'Not Found: Channel does not exist or is not text-based.' }
        );
        return;
      }

      if ( !channel.isTextBased ) {
        res.status( 400 ).send(
          { STATE: false, ERROR: 'Bad Request: Specified channel is not text-based.' }
        );
        return;
      }
      else {
        channel.send( content )
          .then( () => {
            // Message sent successfully
          } )
          .catch( ( err: Error ) => {
            res.status( 500 ).send(
              { STATE: false, ERROR: 'Internal Server Error: Failed to send message.\n' + err.message }
            );
          } );
      }
    }
    catch ( e ) {
      res.status( 500 ).send(
        { ERROR: true, MESSAGE: `Internal Server Error: An unexpected error occurred.\n${( e as Error ).message}` }
      );
      return;
    }

    res.status(200).send(
      { ERROR: false, MESSAGE: 'Message received successfully.' }
    )
  })

  return rtr;
}
