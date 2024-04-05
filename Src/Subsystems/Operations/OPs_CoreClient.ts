// -- System Client --
// Handles the start of a client

// Imports
import { Client, GatewayIntentBits } from 'discord.js'
import { LCARSClient } from '../Auxiliary/LCARSClient.js'

// Exports
export const LCARS47 = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.MessageContent
  ]
}) as LCARSClient
