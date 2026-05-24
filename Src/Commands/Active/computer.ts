// -- COMPUTER --
// One-shot Claude query via slash command. No channel history, persona-selectable,
// per-user cooldown configurable via COMPUTER_CMD_COOLDOWN_SEC (default 60s).

import {
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  AttachmentBuilder,
  MessageFlags
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { runSingleShot, classifyAIError } from '../../Subsystems/Operations/OPs_AICore.js';
import { personas } from '../../Subsystems/Operations/OPs_AIPersonas.js';

const DEFAULT_COOLDOWN_SEC = 60;
const cooldowns = new Map<string, number>();

const data = new SlashCommandBuilder()
  .setName( 'computer' )
  .setDescription( 'One-shot query to LCARS47 (no channel history).' )
  .addStringOption( o => o
    .setName( 'message' )
    .setDescription( 'Your query to the computer.' )
    .setRequired( true )
    .setMaxLength( 2000 )
  )
  .addStringOption( o => o
    .setName( 'persona' )
    .setDescription( 'Response persona (default: LCARS47).' )
    .setRequired( false )
    .addChoices(
      ...Object.values( personas ).map( p => ( { name: p.label, value: p.key } ) )
    )
  )
  .addBooleanOption( o => o
    .setName( 'extended_thinking' )
    .setDescription( 'Enable extended thinking for tougher reasoning (slower).' )
    .setRequired( false )
  ) as SlashCommandBuilder;

function getCooldownSec (): number {
  const raw = process.env.COMPUTER_CMD_COOLDOWN_SEC;
  const parsed = raw != null ? parseInt( raw, 10 ) : NaN;
  return Number.isFinite( parsed ) && parsed >= 0 ? parsed : DEFAULT_COOLDOWN_SEC;
}

function remainingCooldown ( userId: string ): number {
  const cooldownSec = getCooldownSec();
  if ( cooldownSec === 0 ) return 0;
  const last = cooldowns.get( userId );
  if ( last == null ) return 0;
  const elapsed = Math.floor( ( Date.now() - last ) / 1000 );
  return Math.max( 0, cooldownSec - elapsed );
}

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<unknown> {
  if ( int.isAutocomplete() ) return;
  if ( !int.isChatInputCommand() ) return;

  const remaining = remainingCooldown( int.user.id );
  if ( remaining > 0 ) {
    return await int.reply( {
      content: `Cognitive subsystems recharging. Retry in ${remaining}s.`,
      flags: MessageFlags.Ephemeral
    } );
  }

  const message = int.options.getString( 'message', true );
  const personaKey = int.options.getString( 'persona' ) ?? 'default';
  const isAdv = int.options.getBoolean( 'extended_thinking' ) ?? false;

  cooldowns.set( int.user.id, Date.now() );
  Utility.log( 'info', `[COMPUTER] ${int.user.tag} invoked /computer (persona=${personaKey}, adv=${isAdv}).` );

  await int.deferReply();

  try {
    const reply = await runSingleShot( {
      personaKey,
      text: message,
      userDisplayName: int.user.displayName,
      guildId: int.guildId ?? '',
      isAdv
    } );

    if ( reply.trim() === '' ) return await int.editReply( 'LCARS47 produced no response.' );

    if ( reply.length > 2000 ) {
      Utility.log( 'info', '[COMPUTER] Response too long for Discord. Sending as file.' );
      const txtFile = new AttachmentBuilder( Buffer.from( reply, 'utf-8' ), {
        description: 'Response from LCARS47.',
        name: `${int.user.tag}_response.txt`
      } );
      return await int.editReply( { content: 'Response exceeds transmission limit. Attached.', files: [txtFile] } );
    }

    return await int.editReply( reply );
  }
  catch ( err ) {
    const classified = classifyAIError( err );
    Utility.log( 'err', `[COMPUTER] Request failed: ${classified.raw}` );
    return await int.editReply( classified.reply );
  }
}

function help (): string {
  return 'One-shot query to LCARS47 with optional persona selection. No channel history. Per-user cooldown configurable via COMPUTER_CMD_COOLDOWN_SEC (default 60s).';
}

export default {
  name: 'computer',
  data,
  execute,
  help
} satisfies Command;
