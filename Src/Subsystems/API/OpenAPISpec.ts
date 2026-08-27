// -- OpenAPI Specification --
// Builds the LCARS47 OpenAPI document. Route modules contribute their own path
// fragments via the `spec` property on their exported Route; this module supplies
// the surrounding document (info, servers, security, shared schemas) and the
// specs for the base routes owned by APICore.

// Imports
import Utility from '../Utilities/SysUtils';
import type {
  OpenAPIDocument,
  OpenAPIPaths,
  OpenAPIResponse,
  OpenAPISchema
} from './OpenAPIInterfaces';

// Globals

/** Base mount point for the API. */
export const API_BASE_PATH = '/api';

/** Mount point for versioned (v1) route modules. */
export const API_V1_PREFIX = `${ API_BASE_PATH }/v1`;

/** Path serving the Swagger UI explorer. */
export const API_DOCS_PATH = `${ API_BASE_PATH }/docs`;

/** Path serving the raw OpenAPI document. */
export const API_SPEC_PATH = `${ API_BASE_PATH }/openapi.json`;

/** Name of the header carrying the API auth token. */
export const API_AUTH_HEADER = 'x-lcars-auth';

/** Security scheme key referenced by protected operations. */
export const API_SECURITY_SCHEME = 'LCARSAuth';

/**
 * Marks an operation as deliberately unauthenticated. An empty security array
 * is not the same as omitting the field: it documents "no token required"
 * rather than leaving the reader to guess.
 */
export const NO_AUTH_REQUIRED: Record<string, string[]>[] = [];

/**
 * Whether a request is for one of Swagger UI's bundled static assets — the
 * scripts, stylesheet and favicons the docs page pulls in after it loads.
 *
 * A single docs page view fans out into half a dozen of these. The page itself
 * is worth a log line; its scaffolding is not.
 *
 * @param url - The request URL, with or without a query string
 * @returns True for docs assets, false for the docs page itself and everything else
 */
export function isDocsAsset( url: string ): boolean {
  const pathname = url.split( '?' )[0];

  // The docs page, with or without its trailing slash, is not an asset.
  if ( pathname === API_DOCS_PATH || pathname === `${ API_DOCS_PATH }/` ) {
    return false;
  }

  return pathname.startsWith( `${ API_DOCS_PATH }/` );
}

/**
 * The standard LCARS47 response envelope. Every error — and every operation that
 * has no payload of its own — is delivered in this shape.
 */
const APIResponseSchema: OpenAPISchema = {
  type: 'object',
  description: 'Standard LCARS47 response envelope.',
  required: ['ERROR', 'MESSAGE'],
  properties: {
    ERROR: {
      type: 'boolean',
      description: 'True when the request failed.'
    },
    MESSAGE: {
      type: 'string',
      description: 'Human-readable result or failure detail.'
    }
  }
};

/**
 * Payload returned by the stats endpoint. STATE here describes the bot itself,
 * not the outcome of the request.
 */
const StatusResponseSchema: OpenAPISchema = {
  type: 'object',
  description: 'Live LCARS47 telemetry.',
  properties: {
    STATE: { type: 'boolean', description: 'Whether the bot client is ready and online.' },
    VERSION: { type: 'string', description: 'Running LCARS47 version.' },
    SESSION: { type: 'number', description: 'Session counter.' },
    SESSION_UPTIME: {
      oneOf: [
        { type: 'number' },
        { type: 'object', additionalProperties: true }
      ],
      description: 'Uptime as a human-readable duration and a structured diff.'
    },
    STARTUP_TIME: { type: 'string', description: 'Formatted startup timestamp.' },
    STARTUP_UTC: { type: 'number', description: 'Startup time in epoch milliseconds.' },
    QUERIES: { type: 'number', description: 'Total queries served this session.' },
    CMD_QUERIES: { type: 'number', description: 'Total command invocations.' },
    CMD_QUERIES_FAILED: { type: 'number', description: 'Command invocations that failed.' },
    SYSTEM_LATENCY: { type: 'number', description: 'Discord websocket ping in milliseconds.' },
    CLIENT_MEM_USAGE: { type: 'number', description: 'Heap usage in megabytes.' },
    MEDIA_PLAYER_STATE: { type: 'boolean', description: 'Whether the media player is active.' },
    MEDIA_PLAYER_DATA: {
      type: 'object',
      additionalProperties: true,
      description: 'Now-playing details, or an informational notice when idle.'
    }
  }
};

/**
 * Payload returned by the ship endpoint.
 *
 * Coordinates are light years in the Galactic Standard Reference Frame: origin
 * at the galactic centre, +Z galactic north, +X running through Sol.
 */
const ShipPositionResponseSchema: OpenAPISchema = {
  type: 'object',
  description: "The ship's position and any voyage under way.",
  properties: {
    STATUS: {
      type: 'string',
      enum: ['docked', 'orbit', 'idle', 'transit'],
      description: 'What the ship is currently doing.'
    },
    POSITION: { $ref: '#/components/schemas/ShipVector' },
    QUADRANT: {
      type: 'string',
      enum: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      description: 'Galactic quadrant containing the ship.'
    },
    SECTOR: {
      type: 'object',
      description: 'Sector block and sector containing the ship.',
      properties: {
        designation: { type: 'string', description: 'Canon-style sector designation, e.g. "001".' },
        block: { type: 'number', description: 'Sector block number.' },
        index: { type: 'number', description: 'Sector index within the block, 0-99.' },
        grid: { $ref: '#/components/schemas/ShipVector' }
      }
    },
    DISTANCE_FROM_CORE_LY: { type: 'number', description: 'Distance from the galactic centre, light years.' },
    DISTANCE_FROM_SOL_LY: { type: 'number', description: 'Distance from Sol, light years.' },
    ANCHORAGE: {
      type: ['string', 'null'],
      description: 'What the ship is moored to or orbiting; null when under way or adrift.'
    },
    TRANSIT: {
      oneOf: [
        { $ref: '#/components/schemas/ShipTransit' },
        { type: 'null' }
      ],
      description: 'The voyage under way, or null when the ship is not in transit.'
    },
    UPDATED_AT: { type: 'string', format: 'date-time', description: 'When the position was last written.' }
  }
};

/** A point or direction in the Galactic Standard Reference Frame. */
const ShipVectorSchema: OpenAPISchema = {
  type: 'object',
  description: 'A GSRF coordinate triple, in light years.',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    z: { type: 'number' }
  }
};

/** A voyage in progress, with its derived state at the moment of the request. */
const ShipTransitSchema: OpenAPISchema = {
  type: 'object',
  description:
    'A voyage under way. A mid-voyage speed change splits the voyage into legs: the '
    + 'unprefixed fields span the whole voyage, the LEG_ fields describe the segment '
    + 'currently being flown.',
  properties: {
    BEARING: { type: 'number', description: 'Azimuth in degrees; 000 points at the galactic core.' },
    MARK: { type: 'number', description: 'Elevation in degrees, canon "mark" notation.' },
    WARP_FACTOR: { type: 'number', description: 'Ordered warp factor.' },
    DISTANCE_LY: { type: 'number', description: 'Total distance of the voyage, light years.' },
    TRAVELLED_LY: { type: 'number', description: 'Distance covered so far, across every leg.' },
    REMAINING_LY: { type: 'number', description: 'Distance still to run.' },
    PROGRESS: { type: 'number', description: 'Fraction of the whole voyage complete, 0 to 1.' },
    ORIGIN: { $ref: '#/components/schemas/ShipVector' },
    DESTINATION: { $ref: '#/components/schemas/ShipVector' },
    DEPARTED_AT: { type: 'string', format: 'date-time', description: 'When the voyage began.' },
    ETA_AT: { type: 'string', format: 'date-time' },
    ORDERED_BY: { type: 'string', description: 'Discord user ID of whoever gave the order.' },
    LEG_ORIGIN: {
      $ref: '#/components/schemas/ShipVector'
    },
    LEG_DISTANCE_LY: {
      type: 'number',
      description: 'Distance of the current leg. Differs from DISTANCE_LY once the speed has been changed mid-voyage.'
    },
    LEG_DEPARTED_AT: {
      type: 'string',
      format: 'date-time',
      description: 'When the current leg began - the last speed change, or departure.'
    }
  }
};

/** Request body accepted by the sendMessage endpoint. */
const SendMessageRequestSchema: OpenAPISchema = {
  type: 'object',
  required: ['channelId', 'content'],
  properties: {
    channelId: {
      type: 'string',
      description: 'Snowflake ID of the target text channel.'
    },
    content: {
      type: 'string',
      description: 'Message body to post.'
    }
  }
};

/** Payload returned by the API index route. */
const APIIndexResponseSchema: OpenAPISchema = {
  type: 'object',
  properties: {
    message: { type: 'string', description: 'Operational status line.' },
    loadedRoutes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Paths of the route modules discovered at boot.'
    }
  }
};

/** Specs for the base routes registered directly by APICore. */
const BASE_PATHS: OpenAPIPaths = {
  [API_BASE_PATH]: {
    get: {
      summary: 'API index',
      description: 'Reports that the API is operational and lists the discovered route modules.',
      operationId: 'getApiIndex',
      tags: ['System'],
      security: NO_AUTH_REQUIRED,
      responses: {
        '200': {
          description: 'The API is operational.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/APIIndexResponse' } }
          }
        }
      }
    }
  },
  [API_SPEC_PATH]: {
    get: {
      summary: 'OpenAPI document',
      description: 'Returns this specification as raw JSON.',
      operationId: 'getOpenAPIDocument',
      tags: ['System'],
      security: NO_AUTH_REQUIRED,
      responses: {
        '200': {
          description: 'The OpenAPI document.',
          content: {
            'application/json': { schema: { type: 'object', additionalProperties: true } }
          }
        }
      }
    }
  }
};

// Exports

/**
 * Builds a response entry using the standard LCARS47 envelope. Route specs use
 * this so every documented outcome stays consistent with the real payloads.
 *
 * @param description - What this response means
 * @returns An OpenAPI response referencing the shared envelope schema
 */
export function envelopeResponse( description: string ): OpenAPIResponse {
  return {
    description,
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/APIResponse' } }
    }
  };
}

/**
 * Assembles the complete OpenAPI document from the dynamically collected route specs.
 *
 * @param paths - Path fragments contributed by the loaded route modules
 * @param server - Host and port the API is reachable on
 * @returns The full OpenAPI 3.1 document
 */
export function buildDocument(
  paths: OpenAPIPaths,
  server: { host: string, port: string }
): OpenAPIDocument {
  return {
    openapi: '3.1.0',
    info: {
      title: 'LCARS47 API',
      version: Utility.getVersion(),
      description:
        'LAN-facing control and telemetry API for LCARS47, the resident ship\'s computer of ' +
        'the Planetary Dynamics Discord. Endpoints that mutate Discord state require the ' +
        `\`${ API_AUTH_HEADER }\` header.`,
      license: {
        name: 'See LICENSE in the LCARS47 README',
        url: 'https://github.com/SkyeRangerDelta/LCARS47#readme'
      }
    },
    servers: [
      {
        url: `http://${ server.host }:${ server.port }`,
        description: 'LCARS47 host (LAN only).'
      }
    ],
    tags: [
      { name: 'System', description: 'Service metadata and discovery.' },
      { name: 'Telemetry', description: 'Bot status and runtime statistics.' },
      { name: 'Messaging', description: 'Outbound Discord messaging.' },
      { name: 'Navigation', description: 'Ship position and stellar cartography.' }
    ],
    paths: { ...BASE_PATHS, ...paths },
    components: {
      schemas: {
        APIResponse: APIResponseSchema,
        StatusResponse: StatusResponseSchema,
        SendMessageRequest: SendMessageRequestSchema,
        APIIndexResponse: APIIndexResponseSchema,
        ShipPositionResponse: ShipPositionResponseSchema,
        ShipVector: ShipVectorSchema,
        ShipTransit: ShipTransitSchema
      },
      securitySchemes: {
        [API_SECURITY_SCHEME]: {
          type: 'apiKey',
          in: 'header',
          name: API_AUTH_HEADER,
          description: 'Shared secret issued by the LCARS47 host. Set via the API_AUTH_TOKEN environment variable.'
        }
      }
    }
  };
}
