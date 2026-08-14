// Imports
import exp, { type Router } from 'express';
import * as fs from 'node:fs';
import type { Route } from './RouterInterfaces';
import type { OpenAPIPaths } from './OpenAPIInterfaces';
import type { LCARSClient } from '../Auxiliary/LCARSClient';
import { API_V1_PREFIX } from './OpenAPISpec';
import path from 'path';

// Interfaces
export interface LoadedRoutes {
  router: Router
  paths: OpenAPIPaths
}

// Logic
export async function loadRoutes( LCARS47: LCARSClient ): Promise<LoadedRoutes> {
  const targetRouter = exp.Router();
  const paths: OpenAPIPaths = {};

  const routesDir = path.resolve(__dirname, 'v1');
  // Skip compiled *.test.ts - see the note in OPs_CmdHandler.
  const routeIndex = fs.readdirSync( routesDir )
    .filter( r => r.endsWith( '.js' ) && !r.endsWith( '.test.js' ) );

  console.log( `[API] Found ${routeIndex.length} route modules to load.` );

  for  ( const route of routeIndex ) {
    try {
      const modulePath = path.join( routesDir, route );

      await import ( modulePath ).then( ( r: { default: Route } ) => {
        const rt: Route = r.default;
        targetRouter.use( rt.router( LCARS47 ) );

        if ( rt.spec ) {
          for ( const [ routePath, pathItem ] of Object.entries( rt.spec ) ) {
            paths[`${ API_V1_PREFIX }${ routePath }`] = pathItem;
          }
        }
        else {
          console.warn( `[API] Route module ${ rt.name } declares no OpenAPI spec.` );
        }

        console.log(`[API] Loaded route module: ${ rt.name }`);
      } );
    }
    catch (error) {
      console.error(`[API] Failed to load route module: ${route}`, error);
    }
  }

  return { router: targetRouter, paths };
}
