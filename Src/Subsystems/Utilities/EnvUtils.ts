import dotenv from 'dotenv';
import type { LCARSAppConfig, LCARSConfiguration } from '../Auxiliary/Interfaces/ApplicationConfigInterface';

dotenv.config();

/**
 * Generates a configuration object from the environment variables
 * Options are dividied into required and optional
 */
const AppConfiguration: LCARSConfiguration = {
  required: {
    TOKEN: process.env.TOKEN,
    RDS_URI: process.env.RDS,
    OPENAI_KEY: process.env.OPENAIKEY,
    API_PORT: process.env.API_PORT,
    API_HOST: process.env.API_HOST
  },
  optional: {
    JWST_KEY: process.env.JWST_KEY,
    JELLYFIN_HOST: process.env.JELLYFIN_HOST,
    JELLYFIN_PORT: process.env.JELLYFIN_PORT,
    JELLYFIN_APIKEY: process.env.JELLYFIN_APIKEY,
    JELLYFIN_USERNAME: process.env.JELLYFIN_USERNAME,
    JELLYFIN_PASSWORD: process.env.JELLYFIN_PASSWORD
  }
};

export const LCARSAppConfiguration = getConfig( AppConfiguration );

/**
 * Returns the configuration object
 */
function getConfig ( configuration: LCARSConfiguration ): Record<string, string> {
  const validatedConfig: Record<string, any> = {};

  // Validate and extract required configuration
  Object.keys( configuration.required ).forEach( ( key ) => {
    const value = configuration.required[key as keyof typeof configuration.required];
    if ( value === '' || value === null ) {
      throw new Error( `Required configuration "${key}" is missing.` );
    }
    validatedConfig[key] = process.env[key];
  } );

  // Validate and extract optional configuration
  Object.keys( configuration.optional ).forEach( ( key ) => {
    const value = configuration.optional[key as keyof typeof configuration.optional];
    if ( value !== '' || value === null ) { // Only add if the value exists
      validatedConfig[key] = value;
    }
  } );

  return validatedConfig;
}
