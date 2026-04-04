// -- Environment Variable Interfaces --
// Type definitions for environment variable configuration and validation

export interface EnvVarDefinition {
  name: string;
  description: string;
  feature?: string;
  default?: string;
}

export interface EnvFeatureGroup {
  description: string;
  required_together: boolean;
  vars: EnvVarDefinition[];
}

export interface EnvConfig {
  critical: EnvVarDefinition[];
  required: EnvVarDefinition[];
  feature_groups: Record<string, EnvFeatureGroup>;
  optional: EnvVarDefinition[];
}

export interface EnvValidationResult {
  isValid: boolean;
  missingCritical: EnvVarDefinition[];
  missingRequired: EnvVarDefinition[];
  incompleteFeatureGroups: { group: string; missing: string[] }[];
  missingOptional: EnvVarDefinition[];
  appliedDefaults: { name: string; value: string }[];
}

// Typed environment variables export
export interface LCARSEnv {
  // Critical
  TOKEN: string;
  RDS: string;
  PLDYNID: string;
  LCARSID: string;

  // Required
  OPENAIKEY: string;
  MEDIALOG: string;
  ENGINEERING: string;
  SIMLAB: string;
  DEVLAB: string;

  // Optional (may be undefined)
  BESZEL_URL?: string;
  BESZEL_EMAIL?: string;
  BESZEL_PASSWORD?: string;
  JWST?: string;
  JELLYFIN_HOST?: string;
  JELLYFIN_PORT?: string;
  JELLYFIN_KEY?: string;
  JELLYFIN_USER?: string;
  JELLYFIN_PASS?: string;
  API_HOST: string; // Has default
  API_PORT: string; // Has default
  API_AUTH_TOKEN: string; // Has default or auto-generated
}
