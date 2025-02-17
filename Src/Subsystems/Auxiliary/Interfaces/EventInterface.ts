import { type LCARSClient } from '../LCARSClient';

export interface Event {
  name: string
  once: boolean
  execute: ( LCARSClient: LCARSClient, ...args: unknown[] ) => unknown
}
