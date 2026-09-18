// -- System Client --
// Handles the start of a client

// Imports
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { type LCARSClient } from '../Auxiliary/LCARSClient.js';

// Exports
export const LCARS47 = new Client( {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  // Reactions arrive uncached whenever the message predates the current
  // session, which for a reaction on anything older than the last restart is
  // most of them. Without these partials messageReactionAdd simply never fires
  // for those, and the counter would only ever see reactions on brand new
  // messages.
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User
  ]
} ) as LCARSClient;
