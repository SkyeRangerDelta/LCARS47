import type { Router } from 'express';
import type { LCARSClient } from '../Auxiliary/LCARSClient';
import type { OpenAPIPathItem } from './OpenAPIInterfaces';

export interface Route {
  name: string
  router: loadLCARS
  /**
   * OpenAPI fragment for this module, keyed by path relative to the version
   * prefix (e.g. '/stats'). The loader prefixes and merges these into the
   * served specification, so a route documents itself by construction.
   */
  spec?: Record<string, OpenAPIPathItem>
}

export type loadLCARS = ( LCARS47: LCARSClient ) => Router;
