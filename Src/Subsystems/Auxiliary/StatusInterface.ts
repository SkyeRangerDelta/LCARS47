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
  API_LATENCY: number
  CLIENT_MEM_USAGE: number
  MEDIA_PLAYER_STATE: boolean
  MEDIA_PLAYER_DATA: object
}
