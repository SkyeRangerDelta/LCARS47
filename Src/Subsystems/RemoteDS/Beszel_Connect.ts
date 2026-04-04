// Beszel PocketBase Connection

import PocketBase from 'pocketbase';
import Utility from '../Utilities/SysUtils.js';
import { getEnv, isFeatureEnabled } from '../Utilities/EnvUtils.js';
import type { RecordModelOverride } from '../Auxiliary/Interfaces/BeszelInterfaces';

/**
 * Initialize and authenticate PocketBase client for Beszel
 * @returns Promise<PocketBase> - Authenticated PocketBase instance
 */
export async function beszel_connect(): Promise<PocketBase> {
  if ( !isFeatureEnabled( 'beszel' ) ) {
    throw new Error( '[BESZEL] Feature not enabled - missing environment variables' );
  }

  const env = getEnv();
  const baseUrl = env.BESZEL_URL;
  const email = env.BESZEL_EMAIL;
  const password = env.BESZEL_PASSWORD;

  if ( !baseUrl || !email || !password ) {
    throw new Error( '[BESZEL] Missing required environment variables for Beszel connection' );
  }

  Utility.log('info', '[BESZEL] Initializing PocketBase connection...');

  try {
    const pb = new PocketBase(baseUrl);

    // Authenticate as admin
    await pb.collection("_superusers").authWithPassword(email, password);

    const authRecord = pb.authStore.record as RecordModelOverride;
    if (!authRecord) {
      throw new Error('[BESZEL] Authentication failed - no auth record returned');
    }

    Utility.log('proc', `[BESZEL] Authenticated as ${ authRecord.email }`);
    Utility.log('info', `[BESZEL] Auth token valid: ${ pb.authStore.isValid }`);

    return pb;
  } catch (error) {
    Utility.log('err', `[BESZEL] Connection failed: ${(error as Error).message}`);
    throw error;
  }
}

export default {
  beszel_connect
};
