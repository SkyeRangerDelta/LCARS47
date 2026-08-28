// ---- Astrometrics Configuration ----
// Kept apart from AstrometricsService so that service stays free of env access
// and can be tested without a populated environment.

import { type MongoClient } from 'mongodb';

import { getEnv } from '../Utilities/EnvUtils.js';
import type { AstrometricsOptions } from './AstrometricsService.js';

/**
 * Whether outbound catalogue lookups are permitted.
 *
 * Defaults to ON. SIMBAD and STAPI are public, read-only and need no
 * credentials, so there is nothing to configure before the feature works - the
 * variable exists to turn it OFF, for a deployment that would rather not make
 * outbound calls at all.
 */
export function remoteEnabled(): boolean {
  const raw = getEnv().ASTROMETRICS_REMOTE;
  if ( raw == null ) return true;

  return !['false', '0', 'no', 'off'].includes( raw.trim().toLowerCase() );
}

export function astrometricsOptions( connection: MongoClient | null ): AstrometricsOptions {
  return { connection, remoteEnabled: remoteEnabled() };
}

export default { remoteEnabled, astrometricsOptions };
