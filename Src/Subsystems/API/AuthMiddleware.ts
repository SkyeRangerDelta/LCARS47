// -- API Authentication Middleware --
// The single gate for every authenticated API route.
//
// Extracted from sendMessage's inline check so that gating a second route does
// not mean a second interpretation of the same shared secret. The header name,
// the status codes and the envelope wording are deliberately identical to what
// sendMessage has always returned: an absent header is a 401, a wrong token is
// a 403, and callers can tell the two apart.

// Imports
import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../Utilities/EnvUtils';
import { API_AUTH_HEADER } from './OpenAPISpec';

// Globals
const env = getEnv();

/**
 * Rejects a request unless it carries the LCARS47 shared secret.
 *
 * @param req - Incoming request
 * @param res - Response to reject with, when the token is absent or wrong
 * @param next - Passed through only for an authenticated caller
 */
export function requireApiAuth( req: Request, res: Response, next: NextFunction ): void {
  const presented = req.header( API_AUTH_HEADER );

  if ( !presented || presented === '' ) {
    res.status( 401 ).send(
      { ERROR: true, MESSAGE: 'Unauthorized: Missing authentication header.' }
    );
    return;
  }

  if ( presented !== env.API_AUTH_TOKEN ) {
    res.status( 403 ).send(
      { ERROR: true, MESSAGE: 'Forbidden: Invalid authentication token.' }
    );
    return;
  }

  next();
}

export default requireApiAuth;
