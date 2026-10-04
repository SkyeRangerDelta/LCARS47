// -- API Core --

// Imports
import Utility from '../Utilities/SysUtils';
import exp from 'express';
import swaggerUi from 'swagger-ui-express';
import { type LCARSClient } from '../Auxiliary/LCARSClient';
import { loadRoutes } from './RouteLoader';
import { getEnv } from '../Utilities/EnvUtils';
import type { OpenAPIDocument } from './OpenAPIInterfaces';
import {
  API_BASE_PATH,
  API_DOCS_PATH,
  API_SPEC_PATH,
  API_V1_PREFIX,
  buildDocument,
  isDocsAsset
} from './OpenAPISpec';
import { requireApiAuth } from './AuthMiddleware';

const env = getEnv();

/**
 * LCARS47 API Subsystem. Handles all API-related functionality.
 */
export class API {
  public LCARS47: LCARSClient;
  private app = exp();
  private openAPIDocument: OpenAPIDocument;

  /**
   * API Subsystem Constructor
   * @param lcars - The main LCARS47 client instance
   */
  constructor ( public lcars: LCARSClient ) {
    Utility.log( 'info', '[API] Initializing LCARS47 API subsystem...' );
    this.LCARS47 = lcars;

    // Seeded with the base routes only; route modules are merged in once loaded.
    this.openAPIDocument = buildDocument( {}, { host: env.API_HOST, port: env.API_PORT } );

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
      .then( ( { router, paths } ) => {
        this.app.use( API_V1_PREFIX, router );
        this.openAPIDocument = buildDocument( paths, { host: env.API_HOST, port: env.API_PORT } );

        Utility.log( 'info', `[API] Routes initialized successfully. Documented ${ Object.keys( paths ).length } route paths.` );
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
    // Liveness only. This is the one route that answers anonymously, and it
    // says nothing beyond "the service is up" - deliberately no route listing,
    // no version and no counters. Anything that enumerates the API is a
    // discovery aid for an unauthenticated reader, so it lives behind the gate
    // with everything else.
    this.app.get( API_BASE_PATH, ( req, res ) => {
      res.status( 200 ).send( { message: 'LCARS47 API is operational.' } );
    } );

    this.loadDocsRoutes();

    Utility.log( 'info', '[API] Loaded base routes.' );
  }

  /**
   * Serves the OpenAPI document and the Swagger UI explorer.
   *
   * The document is read from the instance on each request rather than captured
   * here, so the spec reflects the route modules discovered at boot. Swagger UI
   * is pointed at the JSON endpoint for the same reason.
   *
   * Both are authenticated. The document lists every path, every schema and the
   * name of the auth header itself, which makes it a broader route listing than
   * the index ever was. Note that this puts the docs page out of reach of a
   * plain browser visit, since the token travels in a header - reach it with a
   * client that can set one, or front it with something that can authenticate a
   * browser session.
   * @private
   */
  private loadDocsRoutes() {
    this.app.get( API_SPEC_PATH, requireApiAuth, ( req, res ) => {
      res.status( 200 ).json( this.openAPIDocument );
    } );

    this.app.use(
      API_DOCS_PATH,
      requireApiAuth,
      swaggerUi.serve,
      swaggerUi.setup( null, {
        explorer: true,
        customSiteTitle: 'LCARS47 API',
        // Empty rather than omitted: swagger-ui-express interpolates this
        // unguarded and renders a literal 'undefined' into the page otherwise.
        customCss: '',
        swaggerOptions: { url: API_SPEC_PATH }
      } )
    );

    Utility.log( 'info', `[API] Swagger UI available at ${ API_DOCS_PATH }.` );
  }

  /**
   * Loads middleware for the API.
   * @private
   */
  private loadMiddleware() {
    // Body Parser
    this.app.use( exp.json() );

    // Request logging. Swagger UI's own asset requests are skipped so a docs
    // page view logs as one line rather than burying real traffic under six.
    this.app.use( ( req, res, next ) => {
      if ( !isDocsAsset( req.url ) ) {
        Utility.log( 'info', `[API] ${ req.method } : ${ req.url }${ req.body ? ' (Has body)' : '' }` );
      }

      next();
    });
  }
}
