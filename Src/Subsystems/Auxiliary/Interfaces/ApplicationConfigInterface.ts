/**
 * Application configuration interface
 * Holds the configuration defined by the process environment variables
 */
export interface LCARSConfiguration {
  required: {
    TOKEN: string | undefined
    RDS_URI: string | undefined
    OPENAI_KEY: string | undefined
    API_PORT: string | undefined
    API_HOST: string | undefined
  }
  optional: {
    JWST_KEY: string | undefined
    JELLYFIN_HOST: string | undefined
    JELLYFIN_PORT: string | undefined
    JELLYFIN_APIKEY: string | undefined
    JELLYFIN_USERNAME: string | undefined
    JELLYFIN_PASSWORD: string | undefined
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
