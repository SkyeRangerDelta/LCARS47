// -- Jellyfin Client Status --

// Imports
import {
  BaseItemDtoQueryResult,
  LibraryApi,
  PublicSystemInfo,
  SessionInfo
} from '@jellyfin/sdk/lib/generated-client'

// Exports
export interface JClientStatus {
  AUTH: boolean
  CONNECTED: boolean
  SESSION_DATA: SessionInfo | undefined
  SYS_INFO: PublicSystemInfo | undefined
  LIBRARY_API: LibraryApi | undefined
  LIBRARIES: BaseItemDtoQueryResult | undefined
  UID: string | undefined

}
