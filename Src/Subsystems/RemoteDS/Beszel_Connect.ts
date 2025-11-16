// Beszel PocketBase Connection

import PocketBase from 'pocketbase';
import Utility from '../Utilities/SysUtils.js';

/**
 * Initialize and authenticate PocketBase client for Beszel
 * @returns Promise<PocketBase> - Authenticated PocketBase instance
 */
export async function beszel_connect(): Promise<PocketBase> {
  const baseUrl = process.env.BESZEL_URL;
  const email = process.env.BESZEL_EMAIL;
  const password = process.env.BESZEL_PASSWORD;

  if (!baseUrl || !email || !password) {
    throw new Error('[BESZEL] Missing environment variables (BESZEL_URL, BESZEL_EMAIL, BESZEL_PASSWORD)');
  }

  Utility.log('info', '[BESZEL] Initializing PocketBase connection...');

  try {
    const pb = new PocketBase(baseUrl);

    // Authenticate as admin
    await pb.admins.authWithPassword(email, password);

    Utility.log('proc', `[BESZEL] Authenticated as ${pb.authStore.record?.email}`);
    Utility.log('info', `[BESZEL] Auth token valid: ${pb.authStore.isValid}`);

    return pb;
  } catch (error) {
    Utility.log('err', `[BESZEL] Connection failed: ${(error as Error).message}`);
    throw error;
  }
}

export default {
  beszel_connect
};
