// -- API Core --

// Imports
import Utility from '../Utilities/SysUtils.js';
import exp from 'express';
import { type LCARSClient } from '../Auxiliary/LCARSClient.js';
import { loadRoutes } from '../API/RouteLoader';
import { getEnv } from '../Utilities/EnvUtils.js';

const env = getEnv();

// Exports
const APICore = {
  loadAPI
};

export default APICore;

// Functions
async function loadAPI ( LCARS47: LCARSClient ) {
  const app = exp();

  console.log('[API] Loading API routes...');

  const loadedRouter = await loadRoutes( LCARS47 );

  app.use( loadedRouter );

  app.listen( env.API_PORT, () => {
    Utility.log( 'info', `[API] LCARS47 API is now listening on port ${env.API_PORT}.` );
  } );
}
