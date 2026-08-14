// Imports
import type { LCARSClient } from '../../Auxiliary/LCARSClient';
import exp from 'express';
import { getEnv } from '../../Utilities/EnvUtils';
import type { TextChannel } from 'discord.js';
import type { SendMessageBody } from '../APIInterfaces';
import type { Route } from '../RouterInterfaces';
import { API_SECURITY_SCHEME, envelopeResponse } from '../OpenAPISpec';

// Globals
const env = getEnv();

// Exports
const sendMessage: Route = {
  name: 'sendMessage',
  router: loadRoute,
  spec: {
    '/sendMessage': {
      post: {
        summary: 'Post a Discord message',
        description:
          'Sends a message to a text channel as LCARS47. Requires a valid auth token.',
        operationId: 'postSendMessage',
        tags: ['Messaging'],
        security: [{ [API_SECURITY_SCHEME]: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SendMessageRequest' } }
          }
        },
        responses: {
          '200': envelopeResponse( 'Message accepted for delivery.' ),
          '400': envelopeResponse( 'Missing channelId or content in the request body.' ),
          '401': envelopeResponse( 'Authentication header was absent or empty.' ),
          '403': envelopeResponse( 'Authentication token was invalid.' ),
          '404': envelopeResponse( 'Channel does not exist or is not text-based.' ),
          '500': envelopeResponse( 'Message delivery failed.' )
        }
      }
    }
  }
}

export default sendMessage;


// Logic
function loadRoute( LCARS47: LCARSClient ) {
  const rtr = exp();

  rtr.post( '/sendMessage', async ( req, res ) => {
    if ( !req.header('x-lcars-auth') || req.header('x-lcars-auth') === '' ) {
      res.status( 401 ).send(
        { ERROR: true, MESSAGE: 'Unauthorized: Missing authentication header.' }
      );
      return;
    }

    if ( req.header('x-lcars-auth') !== env.API_AUTH_TOKEN ) {
      res.status( 403 ).send(
        { ERROR: true, MESSAGE: 'Forbidden: Invalid authentication token.' }
      );
      return;
    }

    try {
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
          { ERROR: true, MESSAGE: 'Not Found: Channel does not exist or is not text-based.' }
        );
        return;
      }

      await channel.send( content )
        .then( () => {
          // Message sent successfully
          res.status( 200 ).send(
            { ERROR: false, MESSAGE: 'Message accepted for delivery.' }
          );

          return;
        } )
        .catch( ( err: Error ) => {
          res.status( 500 ).send(
            { ERROR: true, MESSAGE: 'Internal Server Error: Failed to send message.\n' + err.message }
          );
        } );

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
