// Imports
import exp, { type Router } from 'express';
import * as fs from 'node:fs';
import type { Route } from './RouterInterfaces';
import type { LCARSClient } from '../Auxiliary/LCARSClient';

// Logic
export async function loadRoutes( LCARS47: LCARSClient ): Promise<Router> {
  const targetRouter = exp.Router();

  const routesDir = './v1/';
  const routeIndex = fs.readdirSync( routesDir ).filter( r => r.endsWith( '.js' ) );

  console.log( `[API] Found ${routeIndex.length} route modules to load.` );
  
  for  ( const route of routeIndex ) {
    try {
      const modulePath = `${routesDir}${route}`;

      await import ( modulePath ).then( ( r: { default: Route } ) => {
        const rt: Route = r.default;
        targetRouter.use( rt.router( LCARS47 ) );
        console.log(`[API] Loaded route module: ${modulePath}`);
      } );
    }
    catch (error) {
      console.error(`[API] Failed to load route module: ${route}`, error);
    }
  }

  return targetRouter;
}
