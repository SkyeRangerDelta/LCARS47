/**
 * Application configuration interface
 * Holds the configuration defined by the process environment variables
 */
export interface LCARSConfiguration {
  required: {
    TOKEN: string
    RDS_URI: string
    OPENAI_KEY: string
    API_PORT: string
    API_HOST: string
  }
  optional: {
    JWST_KEY: string
    JELLYFIN_HOST: string
    JELLYFIN_PORT: string
    JELLYFIN_APIKEY: string
    JELLYFIN_USERNAME: string
    JELLYFIN_PASSWORD: string
  }
}

export interface LCARSAppConfig {
  TOKEN: string
  RDS_URI: string
  OPENAI_KEY: string
  API_PORT: string
  API_HOST: string
  JWST_KEY?: string
  JELLYFIN_HOST?: string
  JELLYFIN_PORT?: string
  JELLYFIN_APIKEY?: string
  JELLYFIN_USERNAME?: string
  JELLYFIN_PASSWORD?: string
}
