// -- Status Interface --
export interface StatusInterface {
  STATE: boolean
  VERSION: string
  SESSION: number
  SESSION_UPTIME: number | object
  STARTUP_TIME: string
  STARTUP_UTC: number
  QUERIES: number
  CMD_QUERIES: number
  CMD_QUERIES_FAILED: number
  SYSTEM_LATENCY: number
  CLIENT_MEM_USAGE: number
  MEDIA_PLAYER_STATE: boolean
  MEDIA_PLAYER_DATA: object
}

export interface RDSStatus {
  id: number
  QUERIES: number
  STATE: boolean
  VERSION: string
  CMD_QUERIES: number
  CMD_QUERIES_FAILED: number
  SESSION: number
  STARTUP_TIME: string
  STARTUP_UTC: number
}
