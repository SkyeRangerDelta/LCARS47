// -- API Core --

// Imports
import Utility from '../Utilities/SysUtils';
import exp from 'express';
import { type LCARSClient } from '../Auxiliary/LCARSClient';
import { loadRoutes } from './RouteLoader';
import { getEnv } from '../Utilities/EnvUtils';
import * as fs from 'node:fs';

const env = getEnv();

/**
 * LCARS47 API Subsystem. Handles all API-related functionality.
 */
export class API {
  public LCARS47: LCARSClient;
  private app = exp();

  /**
   * API Subsystem Constructor
   * @param lcars - The main LCARS47 client instance
   */
  constructor ( public lcars: LCARSClient ) {
    Utility.log( 'info', '[API] Initializing LCARS47 API subsystem...' );
    this.LCARS47 = lcars;

    this.initializeRoutes();

    this.app.listen( env.API_PORT, () => {
      Utility.log( 'info', `[API] LCARS47 API is now listening on port ${ env.API_PORT }.` );
    } );
  }

  /**
   * Initializes API routes. Loads dynamic modules before setting up base routes and middleware.
   * @private
   */
  private initializeRoutes() {
    Utility.log( 'info', '[API] Initializing system routes...' );

    this.loadMiddleware();
    this.loadBaseRoutes();

    loadRoutes( this.LCARS47 )
      .then( ( router ) => {
        this.app.use( '/api/v1', router );
        Utility.log( 'info', '[API] Routes initialized successfully.' );
      } )
      .catch( ( err: Error ) => {
        Utility.log( 'error', '[API] Error initializing routes.\n' + err.message );
      } );
  }

  /**
   * Loads base API routes.
   * @private
   */
  private loadBaseRoutes() {
    this.app.get( '/api', ( req, res ) => {
      res.status( 200 ).send( { message: 'LCARS47 API is operational.', loadedRoutes: this.getAllRoutes() } );
    } );

    Utility.log( 'info', '[API] Loaded base routes.' );
  }

  /**
   * Loads middleware for the API.
   * @private
   */
  private loadMiddleware() {
    // Body Parser
    this.app.use( exp.json() );

    // Request logging
    this.app.use( ( req, res, next ) => {
      Utility.log( 'info', `[API] ${ req.method } : ${ req.url }${ req.body ? ' (Has body)' : '' }` );
      next();
    });
  }

  /**
   * Retrieves all expected API routes.
   * @private
   */
  private getAllRoutes() {
    const routes: string[] = [];

    const routesDir = './Src/Subsystems/API/v1/';
    const routeIndex = fs.readdirSync( routesDir ).filter( r => r.endsWith( '.ts' ) || r.endsWith( '.js' ) );

    for ( const route of routeIndex ) {
      const routePath = route.replace( routesDir, '' ).replace( /\.ts$|\.js$/, '' );
      routes.push( `/api/v1/${ routePath }` );
    }

    return routes;
  }
}
