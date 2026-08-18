// -- OpenAPI Specification Tests --
// Guards the shape of the served document and, more importantly, guards against
// route modules drifting out of the docs: every module under v1/ must declare a
// spec, and every $ref it emits must resolve.

import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'path';

import type { Route } from './RouterInterfaces';
import type { OpenAPIDocument, OpenAPIPaths } from './OpenAPIInterfaces';
import {
  API_AUTH_HEADER,
  API_BASE_PATH,
  API_SECURITY_SCHEME,
  API_SPEC_PATH,
  API_DOCS_PATH,
  API_V1_PREFIX,
  buildDocument,
  envelopeResponse,
  isDocsAsset
} from './OpenAPISpec';

// EnvUtils calls process.exit(1) when the environment is incomplete, and route
// modules pull it in transitively. Stub it so the real modules can be imported.
vi.mock( '../Utilities/EnvUtils', () => ( {
  getEnv: () => ( {
    RDS: 'mongodb://localhost:27017',
    API_HOST: 'localhost',
    API_PORT: '9121',
    API_AUTH_TOKEN: 'test-token'
  } ),
  isFeatureEnabled: () => false,
  default: { getEnv: () => ( {} ), isFeatureEnabled: () => false }
} ) );

const SERVER = { host: 'lcars.lan', port: '9121' };

const v1Dir = path.resolve( __dirname, 'v1' );
const routeFiles = fs.readdirSync( v1Dir ).filter( f => f.endsWith( '.ts' ) && !f.endsWith( '.test.ts' ) );

/**
 * Loads every real route module the same way RouteLoader does.
 */
async function loadRouteModules(): Promise<Route[]> {
  const modules: Route[] = [];

  for ( const file of routeFiles ) {
    const mod = await import( `./v1/${ file.replace( /\.ts$/, '' ) }.ts` ) as { default: Route };
    modules.push( mod.default );
  }

  return modules;
}

/**
 * Merges route specs under the version prefix, mirroring RouteLoader.
 */
function mergeSpecs( modules: Route[] ): OpenAPIPaths {
  const paths: OpenAPIPaths = {};

  for ( const rt of modules ) {
    for ( const [ routePath, pathItem ] of Object.entries( rt.spec ?? {} ) ) {
      paths[`${ API_V1_PREFIX }${ routePath }`] = pathItem;
    }
  }

  return paths;
}

/**
 * Collects every $ref string appearing anywhere in the document.
 */
function collectRefs( node: unknown, found: string[] = [] ): string[] {
  if ( Array.isArray( node ) ) {
    for ( const entry of node ) {
      collectRefs( entry, found );
    }
  }
  else if ( node !== null && typeof node === 'object' ) {
    for ( const [ key, value ] of Object.entries( node as Record<string, unknown> ) ) {
      if ( key === '$ref' && typeof value === 'string' ) {
        found.push( value );
      }
      else {
        collectRefs( value, found );
      }
    }
  }

  return found;
}

describe( 'buildDocument', () => {
  it( 'emits a well-formed OpenAPI 3.1 envelope', () => {
    const doc = buildDocument( {}, SERVER );

    expect( doc.openapi ).toBe( '3.1.0' );
    expect( doc.info.title ).toBe( 'LCARS47 API' );
    expect( doc.info.version ).toMatch( /^V47\./ );
    expect( doc.servers?.[0].url ).toBe( 'http://lcars.lan:9121' );
  } );

  it( 'declares the LCARS auth header as an apiKey security scheme', () => {
    const scheme = buildDocument( {}, SERVER ).components?.securitySchemes?.[API_SECURITY_SCHEME];

    expect( scheme ).toBeDefined();
    expect( scheme?.type ).toBe( 'apiKey' );
    expect( scheme?.in ).toBe( 'header' );
    expect( scheme?.name ).toBe( API_AUTH_HEADER );
  } );

  it( 'documents the base routes owned by APICore', () => {
    const doc = buildDocument( {}, SERVER );

    expect( doc.paths[API_BASE_PATH]?.get ).toBeDefined();
    expect( doc.paths[API_SPEC_PATH]?.get ).toBeDefined();
  } );

  it( 'merges caller-supplied route paths alongside the base routes', () => {
    const doc = buildDocument(
      { '/api/v1/example': { get: { responses: { '200': { description: 'ok' } } } } },
      SERVER
    );

    expect( doc.paths['/api/v1/example'] ).toBeDefined();
    expect( doc.paths[API_BASE_PATH] ).toBeDefined();
  } );

  it( 'standardises error responses on the ERROR/MESSAGE envelope', () => {
    const response = envelopeResponse( 'Something failed.' );
    const schema = buildDocument( {}, SERVER ).components?.schemas?.APIResponse;

    expect( response.content?.['application/json'].schema.$ref )
      .toBe( '#/components/schemas/APIResponse' );
    expect( schema?.required ).toEqual( ['ERROR', 'MESSAGE'] );
    expect( Object.keys( schema?.properties ?? {} ) ).toEqual( ['ERROR', 'MESSAGE'] );
  } );
} );

describe( 'isDocsAsset', () => {
  it( 'treats the docs page itself as loggable traffic', () => {
    expect( isDocsAsset( API_DOCS_PATH ) ).toBe( false );
    expect( isDocsAsset( `${ API_DOCS_PATH }/` ) ).toBe( false );
    expect( isDocsAsset( `${ API_DOCS_PATH }/?docExpansion=none` ) ).toBe( false );
  } );

  it( 'filters out the assets Swagger UI pulls in after load', () => {
    const assets = [
      'swagger-ui.css',
      'swagger-ui-bundle.js',
      'swagger-ui-standalone-preset.js',
      'swagger-ui-init.js',
      'favicon-32x32.png',
      'favicon-16x16.png'
    ];

    for ( const asset of assets ) {
      expect( isDocsAsset( `${ API_DOCS_PATH }/${ asset }` ), asset ).toBe( true );
    }
  } );

  it( 'leaves real API traffic alone', () => {
    expect( isDocsAsset( '/api' ) ).toBe( false );
    expect( isDocsAsset( '/api/openapi.json' ) ).toBe( false );
    expect( isDocsAsset( `${ API_V1_PREFIX }/stats` ) ).toBe( false );
    expect( isDocsAsset( `${ API_V1_PREFIX }/sendMessage` ) ).toBe( false );
  } );

  it( 'does not filter paths that merely share the docs prefix', () => {
    expect( isDocsAsset( `${ API_DOCS_PATH }-internal/asset.js` ) ).toBe( false );
    expect( isDocsAsset( `${ API_DOCS_PATH }x` ) ).toBe( false );
  } );
} );

describe( 'route module documentation', () => {
  it( 'finds route modules to check', () => {
    expect( routeFiles.length ).toBeGreaterThan( 0 );
  } );

  it( 'requires every v1 route module to declare a spec', async () => {
    const modules = await loadRouteModules();

    for ( const rt of modules ) {
      expect( rt.spec, `Route module '${ rt.name }' declares no OpenAPI spec.` ).toBeDefined();
      expect( Object.keys( rt.spec ?? {} ).length ).toBeGreaterThan( 0 );
    }
  } );

  it( 'requires every documented operation to carry an operationId, tag and responses', async () => {
    const paths = mergeSpecs( await loadRouteModules() );

    for ( const [ routePath, pathItem ] of Object.entries( paths ) ) {
      for ( const [ method, operation ] of Object.entries( pathItem ) ) {
        const label = `${ method.toUpperCase() } ${ routePath }`;

        expect( operation.operationId, `${ label } has no operationId.` ).toBeTruthy();
        expect( operation.tags?.length, `${ label } has no tags.` ).toBeGreaterThan( 0 );
        expect( Object.keys( operation.responses ).length, `${ label } documents no responses.` )
          .toBeGreaterThan( 0 );
      }
    }
  } );

  it( 'requires every operation to state its auth posture explicitly', async () => {
    // An omitted `security` field is ambiguous — it silently inherits whatever
    // the document root says. Public routes must declare an empty array.
    const paths = { ...mergeSpecs( await loadRouteModules() ) };
    const doc = buildDocument( paths, SERVER );

    for ( const [ routePath, pathItem ] of Object.entries( doc.paths ) ) {
      for ( const [ method, operation ] of Object.entries( pathItem ) ) {
        expect(
          operation.security,
          `${ method.toUpperCase() } ${ routePath } does not declare security.`
        ).toBeDefined();
      }
    }
  } );

  it( 'protects the messaging route with the LCARS auth scheme', async () => {
    const paths = mergeSpecs( await loadRouteModules() );
    const operation = paths[`${ API_V1_PREFIX }/sendMessage`]?.post;

    expect( operation?.security ).toEqual( [{ [API_SECURITY_SCHEME]: [] }] );
  } );

  it( 'resolves every $ref against a declared component schema', async () => {
    const doc: OpenAPIDocument = buildDocument( mergeSpecs( await loadRouteModules() ), SERVER );
    const schemas = doc.components?.schemas ?? {};

    const refs = collectRefs( doc );
    expect( refs.length ).toBeGreaterThan( 0 );

    for ( const ref of refs ) {
      const name = ref.replace( '#/components/schemas/', '' );
      expect( schemas[name], `Unresolved reference: ${ ref }` ).toBeDefined();
    }
  } );

  it( 'mounts every documented route path under the version prefix', async () => {
    const paths = mergeSpecs( await loadRouteModules() );

    expect( Object.keys( paths ).length ).toBe( routeFiles.length );
    for ( const routePath of Object.keys( paths ) ) {
      expect( routePath.startsWith( API_V1_PREFIX ) ).toBe( true );
    }
  } );
} );
