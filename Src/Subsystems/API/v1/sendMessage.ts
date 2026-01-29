// Imports
import type { LCARSClient } from '../../Auxiliary/LCARSClient';
import exp from 'express';
import { getEnv } from '../../Utilities/EnvUtils';

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

  rtr.post( '/sendMessage', ( req, res ) => {
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

    res.status(200).send(
      { STATE: true, MESSAGE: 'Message received successfully.' }
    )
  })

  return rtr;
}
