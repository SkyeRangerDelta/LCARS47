// -- STATUS --

// Imports
import { type ChatInputCommandInteraction, type InteractionResponse } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';

import Utility from '../../Subsystems/Utilities/SysUtils.js';

// Functions
const data = new SlashCommandBuilder()
  .setName( 'stardate' )
  .setDescription( 'Reports the stardate and shipboard times.' );

async function execute ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<InteractionResponse | void> {

  return await int.reply( { content: `### Shipboard Timestamp\nStardate: \`${ Utility.stardate() }\`\nShipboard Time: \`${ Utility.shipboardTime() }\`` } );
}

function help (): string {
  return 'Displays a report of all LCARS47s system states and session variables.';
}

// Exports
export default {
  name: 'Stardate',
  data,
  execute,
  help
};
