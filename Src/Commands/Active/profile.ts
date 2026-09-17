// -- PROFILE --
// Per-member activity telemetry. Counters only - no XP, no levels, no ranks.

// Imports
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildMember,
  type User
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import Stats from '../../Subsystems/Stats/Stats_Utilities.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import type { UserStatsRecord } from '../../Subsystems/Auxiliary/Interfaces/UserStatsInterface.js';

// Constants
const COLOUR_PROFILE = 0x9999ff;

/**
 * Counters only start at deploy, so the numbers are a floor rather than a
 * lifetime total. Say so instead of letting the embed imply otherwise.
 */
const FOOTER_TEXT = 'Personnel File • counters run from LCARS deployment, not from your join date';

// Cmd Data
const data = new SlashCommandBuilder()
  .setName( 'profile' )
  .setDescription( 'Displays a crew member\'s activity record.' );

data.addUserOption( o => o
  .setName( 'officer' )
  .setDescription( 'Whose record to pull. Defaults to your own.' )
  .setRequired( false )
);

// Functions
async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<void> {
  if ( int.isAutocomplete() ) {
    await int.respond( [ { name: 'This command does not support autocomplete.', value: 'none' } ] );
    return;
  }

  const target: User = int.options.getUser( 'officer' ) ?? int.user;

  Utility.log( 'info', `[PROFILE] Record requested for ${ target.username }.` );

  await int.deferReply();

  const record = await Stats.getUserStats( LCARS47.RDS_CONNECTION, target.id );

  // getMember returns the cached member when the option was supplied, and null
  // for a user who is not in the guild. Falls back to the invoker's own member
  // object, which is always present for a guild command.
  const member = ( int.options.getMember( 'officer' ) as GuildMember | null )
    ?? ( target.id === int.user.id ? int.member as GuildMember | null : null );

  await int.editReply( { embeds: [ buildProfileEmbed( target, member, record ) ] } );
}

/**
 * Shape the record into an embed.
 *
 * Exported so the tests can assert on the field layout without standing up an
 * interaction - the same split amp.ts and astrometrics.ts use.
 *
 * @param target - The user whose record this is.
 * @param member - Their guild member object, or null if they have left.
 * @param record - Their stats document, or null if they have never been seen.
 */
export function buildProfileEmbed(
  target: User,
  member: GuildMember | null,
  record: UserStatsRecord | null
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle( `🖖 Personnel File — ${ member?.displayName ?? target.username }` )
    .setColor( COLOUR_PROFILE )
    .setThumbnail( target.displayAvatarURL() )
    .setFooter( { text: FOOTER_TEXT } );

  if ( record == null ) {
    embed.setDescription(
      'No telemetry on file for this officer yet. Records begin at their next '
      + 'message, command or reaction.'
    );
    return embed;
  }

  const total = record.COMMANDS + record.COMMANDS_FAILED;

  embed.addFields(
    { name: 'Messages Sent', value: `${ record.MESSAGES }`, inline: true },
    { name: 'Commands Run', value: `${ record.COMMANDS }`, inline: true },
    { name: 'Reactions Added', value: `${ record.REACTIONS }`, inline: true }
  );

  // A zero here is the normal case and not worth a field of its own.
  if ( record.COMMANDS_FAILED > 0 ) {
    embed.addFields( {
      name: 'Commands Failed',
      value: `${ record.COMMANDS_FAILED } of ${ total }`,
      inline: true
    } );
  }

  if ( member?.joinedAt != null ) {
    embed.addFields( {
      name: 'Joined',
      value: `${ Utility.flexTime( member.joinedAt ) }\n`
        + `Aboard for ${ Utility.formatMSDiff( member.joinedTimestamp! ).toHuman( { unitDisplay: 'long' } ) }`,
      inline: false
    } );
  }

  embed.addFields(
    { name: 'First Logged', value: Utility.flexTime( new Date( record.firstSeen ) ), inline: true },
    { name: 'Last Active', value: Utility.flexTime( new Date( record.lastSeen ) ), inline: true }
  );

  return embed;
}

function help (): string {
  return 'Displays a crew member\'s activity record - messages, commands and reactions.';
}

// Exports
export default {
  name: 'profile',
  data,
  execute,
  help
} satisfies Command;
