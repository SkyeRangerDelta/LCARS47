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
    this.app.get( API_BASE_PATH, ( req, res ) => {
      res.status( 200 ).send( { message: 'LCARS47 API is operational.', loadedRoutes: this.getAllRoutes() } );
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
   * @private
   */
  private loadDocsRoutes() {
    this.app.get( API_SPEC_PATH, ( req, res ) => {
      res.status( 200 ).json( this.openAPIDocument );
    } );

    this.app.use(
      API_DOCS_PATH,
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

  /**
   * Retrieves the versioned API routes currently mounted.
   *
   * Read from the assembled OpenAPI document rather than the filesystem. The
   * document reflects what actually loaded, and it exists in the deployed
   * image — the TypeScript sources do not, as only Deploy/ is copied into the
   * runtime container.
   * @private
   */
  private getAllRoutes(): string[] {
    return Object.keys( this.openAPIDocument.paths )
      .filter( route => route.startsWith( `${ API_V1_PREFIX }/` ) )
      .sort();
  }
}
