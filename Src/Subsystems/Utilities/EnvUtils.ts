// -- Environment Utilities --
// Centralized environment variable loading, validation, and access

import dotenv from 'dotenv';
import colors from 'colors';
import envConfig from '../Auxiliary/ENVChecks.json';
import type {
  EnvConfig,
  EnvValidationResult,
  LCARSEnv
} from '../Auxiliary/Interfaces/EnvInterface.js';

// Load .env file first
dotenv.config();

// Cast the imported JSON to our typed interface
const config = envConfig as EnvConfig;

let validated = false;

/**
 * Validates all environment variables against ENVChecks.json. Default values are applied.
 * The function also may modify process.env calls with item defaults if needed.
 *
 * @returns EnvValidationResult with details about missing/present vars
 */
function validateEnvironment(): EnvValidationResult {
  const result: EnvValidationResult = {
    isValid: true,
    missingCritical: [],
    missingRequired: [],
    incompleteFeatureGroups: [],
    missingOptional: [],
    appliedDefaults: []
  };

  // Check critical variables
  for ( const varDef of config.critical ) {
    if ( !process.env[varDef.name] ) {
      result.missingCritical.push( varDef );
      result.isValid = false;
    }
  }

  // Check required variables
  for ( const varDef of config.required ) {
    if ( !process.env[varDef.name] ) {
      result.missingRequired.push( varDef );
      result.isValid = false;
    }
  }

  // Check feature groups (all-or-nothing validation for required vars)
  for ( const [groupName, group] of Object.entries( config.feature_groups ) ) {
    // Separate required vars (no default) from optional vars (has default)
    const requiredVars = group.vars.filter( v => v.default === undefined );
    const optionalVars = group.vars.filter( v => v.default !== undefined );

    // Apply defaults for optional vars in feature groups
    for ( const varDef of optionalVars ) {
      if ( !process.env[varDef.name] && varDef.default !== undefined ) {
        process.env[varDef.name] = varDef.default;
        result.appliedDefaults.push( { name: varDef.name, value: varDef.default } );
      }
    }

    // Check if any required var is present (indicates user is trying to enable the feature)
    const presentRequiredVars = requiredVars.filter( v => process.env[v.name] );
    const missingRequiredVars = requiredVars.filter( v => !process.env[v.name] );

    // Only flag as incomplete if some required vars are set but others are missing
    if ( group.required_together && presentRequiredVars.length > 0 && missingRequiredVars.length > 0 ) {
      result.incompleteFeatureGroups.push( {
        group: groupName,
        missing: missingRequiredVars.map( v => v.name )
      } );
    }
  }

  // Check optional variables and apply defaults
  for ( const varDef of config.optional ) {
    if ( !process.env[varDef.name] ) {
      if ( varDef.default !== undefined ) {
        process.env[varDef.name] = varDef.default;
        result.appliedDefaults.push( { name: varDef.name, value: varDef.default } );
      }
      else {
        result.missingOptional.push( varDef );
      }
    }
  }

  return result;
}

/**
 * Logs validation results in a structured format
 * Only displays output if there are issues to report
 */
function logValidationResult( result: EnvValidationResult ): void {
  const hasIssues = result.missingCritical.length > 0 ||
                    result.missingRequired.length > 0 ||
                    result.incompleteFeatureGroups.length > 0;

  if ( !hasIssues ) {
    return;
  }

  console.log( colors.cyan( '=' .repeat( 50 ) ) );
  console.log( colors.cyan( '[ENV] Environment Variable Validation Report' ) );
  console.log( colors.cyan( '=' .repeat( 50 ) ) );

  // Critical missing
  if ( result.missingCritical.length > 0 ) {
    console.log( colors.red( '\n[ENV] CRITICAL - Missing (Bot cannot start):' ) );
    for ( const v of result.missingCritical ) {
      console.log( colors.red( `  - ${v.name}: ${v.description}` ) );
      if ( v.feature ) {
        console.log( colors.red( `    Feature: ${v.feature}` ) );
      }
    }
  }

  // Required missing
  if ( result.missingRequired.length > 0 ) {
    console.log( colors.red( '\n[ENV] REQUIRED - Missing (Bot cannot start):' ) );
    for ( const v of result.missingRequired ) {
      console.log( colors.red( `  - ${v.name}: ${v.description}` ) );
      if ( v.feature ) {
        console.log( colors.red( `    Feature: ${v.feature}` ) );
      }
    }
  }

  // Incomplete feature groups
  if ( result.incompleteFeatureGroups.length > 0 ) {
    console.log( colors.yellow( '\n[ENV] WARNING - Incomplete feature groups:' ) );
    for ( const group of result.incompleteFeatureGroups ) {
      const groupDef = config.feature_groups[group.group];
      console.log( colors.yellow( `  ${group.group}: ${groupDef.description}` ) );
      console.log( colors.yellow( `    Missing: ${group.missing.join( ', ' )}` ) );
      console.log( colors.yellow( '    (Feature will be disabled)' ) );
    }
  }

  console.log( colors.cyan( '\n' + '=' .repeat( 50 ) ) );
}

/**
 * Main validation entry point - called on import
 */
function bootCheck(): void {
  console.log( colors.green( '[ENV] Starting environment validation...' ) );

  const result = validateEnvironment();
  logValidationResult( result );

  if ( !result.isValid ) {
    console.log( colors.red( '\n[ENV] FATAL: Cannot start bot due to missing environment variables.' ) );
    console.log( colors.red( '[ENV] Please configure the required variables and restart.' ) );
    console.log( colors.red( '[ENV] See ENVChecks.json for complete variable documentation.\n' ) );
    process.exit( 1 );
  }

  validated = true;
  console.log( colors.green( '[ENV] Environment validation complete. All required variables present.' ) );
}

/**
 * Check if a feature group is fully configured
 * Use this before initializing optional features
 * Vars with defaults are considered "present" even if not explicitly set
 */
export function isFeatureEnabled( groupName: string ): boolean {
  const group = config.feature_groups[groupName];
  if ( !group ) {
    return false;
  }

  // Only required vars (no default) need to be explicitly set
  const requiredVars = group.vars.filter( v => v.default === undefined );
  return requiredVars.every( v => !!process.env[v.name] );
}

/**
 * Get typed environment variables
 * Only call after validation has passed
 */
export function getEnv(): LCARSEnv {
  if ( !validated ) {
    throw new Error( '[ENV] Environment not validated yet. Cannot access variables.' );
  }

  return {
    TOKEN: process.env.TOKEN!,
    RDS: process.env.RDS!,
    PLDYNID: process.env.PLDYNID!,
    LCARSID: process.env.LCARSID!,
    OPENAIKEY: process.env.OPENAIKEY!,
    MEDIALOG: process.env.MEDIALOG!,
    ENGINEERING: process.env.ENGINEERING!,
    SIMLAB: process.env.SIMLAB!,
    DEVLAB: process.env.DEVLAB!,
    BESZEL_URL: process.env.BESZEL_URL,
    BESZEL_EMAIL: process.env.BESZEL_EMAIL,
    BESZEL_PASSWORD: process.env.BESZEL_PASSWORD,
    JWST: process.env.JWST,
    JELLYFIN_HOST: process.env.JELLYFIN_HOST,
    JELLYFIN_PORT: process.env.JELLYFIN_PORT,
    JELLYFIN_KEY: process.env.JELLYFIN_KEY,
    JELLYFIN_USER: process.env.JELLYFIN_USER,
    JELLYFIN_PASS: process.env.JELLYFIN_PASS,
    API_HOST: process.env.API_HOST!,
    API_PORT: process.env.API_PORT!
  };
}

// Run validation on import
bootCheck();

// Export for use elsewhere
export default { isFeatureEnabled, getEnv };
