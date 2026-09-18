// -- YTDLP-UPDATE --
// Admin slash command: refreshes the yt-dlp binary in place. Use when
// YouTube playback breaks (the npm wrapper is fine; the binary itself is
// what rots).

import { SlashCommandBuilder } from '@discordjs/builders';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type InteractionResponse,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';

import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import { isAdminUser } from '../../Subsystems/Utilities/AuthUtils.js';
import { getYtDlpManager } from '../../Subsystems/MediaPlayer/YtDlpManager.js';

const data = new SlashCommandBuilder()
  .setName( 'ytdlp-update' )
  .setDescription( 'Refresh the yt-dlp binary used for YouTube playback.' )
  .setDefaultMemberPermissions( PermissionFlagsBits.Administrator );

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  if ( !isAdminUser( int.user.id, int.memberPermissions ) ) {
    return await int.reply( {
      content: 'Not authorised.',
      flags: MessageFlags.Ephemeral
    } );
  }

  await int.deferReply( { flags: MessageFlags.Ephemeral } );

  const manager = getYtDlpManager();
  const before = await manager.getVersion();

  try {
    Utility.log( 'info', `[YT-DLP] Admin refresh requested by ${ int.user.id }.` );
    await manager.update();
  }
  catch ( err ) {
    await int.editReply( `yt-dlp refresh failed: ${ String( err ) }` );
    return;
  }

  const after = await manager.getVersion();
  await int.editReply(
    `yt-dlp refreshed.\nBefore: \`${ before ?? 'unknown' }\`\nAfter: \`${ after ?? 'unknown' }\``
  );
  // Suppress unused-client lint
  void LCARS47;
}

function help (): string {
  return 'Admin: refresh the yt-dlp binary used for YouTube playback.';
}

export default {
  name: 'YtDlpUpdate',
  data,
  execute,
  help
} satisfies Command;
