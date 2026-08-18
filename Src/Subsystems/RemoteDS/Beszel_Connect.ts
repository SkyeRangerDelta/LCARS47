// Beszel PocketBase Connection

import PocketBase from 'pocketbase';
import Utility from '../Utilities/SysUtils.js';
import { getEnv, isFeatureEnabled } from '../Utilities/EnvUtils.js';
import type { RecordModelOverride } from '../Auxiliary/Interfaces/BeszelInterfaces';

/**
 * Refresh once the token has this little life left.
 *
 * Beszel issues superuser tokens with a **24 hour** lifetime, so without
 * renewal a long-running bot goes quietly deaf about a day after every restart:
 * the reconcile sweep starts failing, realtime dies, and alerts simply stop.
 * That is the worst failure mode a monitor can have, because nothing looks
 * wrong.
 *
 * Two hours of margin against a check that runs at least every five minutes is
 * roughly twenty-four chances to notice before it matters.
 */
const REFRESH_MARGIN_MS = 2 * 60 * 60 * 1000;

/**
 * Floor on how often a renewal may be attempted. Guards against a pathologically
 * short token turning every request into a refresh storm.
 */
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** Per-client throttle. WeakMap so tests and multiple clients cannot collide. */
const lastRefreshAttempt = new WeakMap<PocketBase, number>();

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
    Utility.log('info', `[BESZEL] Auth token valid: ${ pb.authStore.isValid }, ${ describeTokenLife( pb ) }`);

    return pb;
  } catch (error) {
    Utility.log('err', `[BESZEL] Connection failed: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * When does the current token expire, as a UTC ms timestamp?
 *
 * PocketBase hands back a JWT and the `exp` claim is the only honest answer —
 * `authStore.isValid` only flips once expiry has already happened, which is too
 * late to renew gracefully.
 *
 * @returns Expiry timestamp, or null if there is no readable token.
 */
export function beszel_tokenExpiry( pb: PocketBase ): number | null {
  const token = pb.authStore?.token;
  if ( token == null || token === '' ) return null;

  const segments = token.split( '.' );
  if ( segments.length < 2 ) return null;

  try {
    const claims = JSON.parse(
      Buffer.from( segments[1], 'base64url' ).toString( 'utf8' )
    ) as { exp?: number };

    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  }
  catch {
    return null;
  }
}

/**
 * Renew the Beszel session if it is close to expiring.
 *
 * Cheap to call: the common path is a local JWT decode and a comparison, with no
 * network traffic at all. Call it before any Beszel operation rather than
 * scheduling a separate job — the monitor's reconcile tick, /server-status and
 * the AI tool then all keep the session alive as a side effect of being used,
 * and there is no timer to drift or die.
 *
 * Falls back to a full credential login when the refresh itself fails, which is
 * what happens if the token expired while the bot was suspended or Beszel was
 * restarted out from under us.
 */
export async function beszel_ensureAuth( pb: PocketBase ): Promise<void> {
  const expiry = beszel_tokenExpiry( pb );
  const remaining = expiry == null ? 0 : expiry - Date.now();

  if ( pb.authStore.isValid && remaining > REFRESH_MARGIN_MS ) return;

  const lastAttempt = lastRefreshAttempt.get( pb ) ?? 0;
  if ( Date.now() - lastAttempt < MIN_REFRESH_INTERVAL_MS ) return;
  lastRefreshAttempt.set( pb, Date.now() );

  try {
    await pb.collection( '_superusers' ).authRefresh();
    Utility.log( 'proc', `[BESZEL] Auth token renewed, ${ describeTokenLife( pb ) }` );
    return;
  }
  catch ( err ) {
    Utility.log( 'warn',
      `[BESZEL] Token refresh failed (${ ( err as Error ).message }); re-authenticating from credentials.` );
  }

  const env = getEnv();
  if ( env.BESZEL_EMAIL == null || env.BESZEL_PASSWORD == null ) {
    throw new Error( '[BESZEL] Cannot re-authenticate - credentials are no longer configured' );
  }

  await pb.collection( '_superusers' ).authWithPassword( env.BESZEL_EMAIL, env.BESZEL_PASSWORD );
  Utility.log( 'proc', `[BESZEL] Re-authenticated from credentials, ${ describeTokenLife( pb ) }` );
}

function describeTokenLife( pb: PocketBase ): string {
  const expiry = beszel_tokenExpiry( pb );
  if ( expiry == null ) return 'expiry unknown';

  const hours = ( expiry - Date.now() ) / 3_600_000;
  return `expires in ${ hours.toFixed( 1 ) }h`;
}

export default {
  beszel_connect,
  beszel_ensureAuth,
  beszel_tokenExpiry
};
