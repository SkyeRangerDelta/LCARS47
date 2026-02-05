import type { Router } from 'express';
import type { LCARSClient } from '../Auxiliary/LCARSClient';

export interface Route {
  name: string
  router: loadLCARS
}

export type loadLCARS = ( LCARS47: LCARSClient ) => Router;
