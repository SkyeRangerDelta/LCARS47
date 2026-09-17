// -- ROLE --
// Self-assigning game roles, plus the flag officer controls over what the crew
// is allowed to assign.
//
// The old /role join|leave pair is gone. They took a native role option, which
// renders every role in the guild with no way to filter it - Discord offers no
// server-side filter for that picker, so the only possible fix was to stop
// using it. Everything here builds its options from the allowlist instead.

// Imports
import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildMember,
  MessageFlags,
  type Role,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import Auth from '../../Subsystems/Utilities/AuthUtils.js';
import Roles from '../../Subsystems/Roles/Roles_Utilities.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import type { ResolvedSelfRole } from '../../Subsystems/Auxiliary/Interfaces/RoleInterfaces.js';

// Constants
const COLOUR_ROLES = 0x66ccff;

/** Discord's cap on a select option label. */
const LABEL_MAX = 100;

/** Discord's cap on an embed field value. */
const FIELD_VALUE_MAX = 1024;

// Cmd Data
const data = new SlashCommandBuilder()
  .setName( 'role' )
  .setDescription( 'Self-assign game roles.' );

data.addSubcommand( s => s
  .setName( 'select' )
  .setDescription( 'Pick your game roles from a menu.' )
);

data.addSubcommand( s => s
  .setName( 'add' )
  .setDescription( 'Flag officers: make a role self-assignable.' )
  .addRoleOption( o => o
    .setName( 'role-name' )
    .setDescription( 'Role to open up for self-assignment.' )
    .setRequired( true )
  )
);

data.addSubcommand( s => s
  .setName( 'remove' )
  .setDescription( 'Flag officers: stop a role being self-assignable.' )
  .addRoleOption( o => o
    .setName( 'role-name' )
    .setDescription( 'Role to close off.' )
    .setRequired( true )
  )
);

data.addSubcommand( s => s
  .setName( 'list' )
  .setDescription( 'Flag officers: review the self-assignable role list.' )
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

  const subCmd = int.options.getSubcommand();
  Utility.log( 'info', `[ROLE-SYS] Received a new ${subCmd} role command.` );

  switch ( subCmd ) {
    case 'select':
      return await selectRoles( LCARS47, int );
    case 'add':
      return await addRole( LCARS47, int );
    case 'remove':
      return await removeRole( LCARS47, int );
    case 'list':
      return await listRoles( LCARS47, int );
    default:
      await int.reply( {
        content: 'Unauthorized segment access. Command terminated.',
        flags: MessageFlags.Ephemeral
      } );
  }
}

// -- Member-facing --

/**
 * Open the picker.
 *
 * Ephemeral on purpose, and not only for noise: the response is per-viewer,
 * which is the whole reason the menu can show the invoker's current roles
 * pre-selected. A shared message could not.
 */
async function selectRoles ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<void> {
  await int.deferReply( { flags: MessageFlags.Ephemeral } );

  const member = int.member as GuildMember | null;
  if ( member == null || int.guild == null ) {
    await int.editReply( { content: 'Segment fault: unable to identify member role manager.' } );
    return;
  }

  const records = await Roles.listSelfRoles( LCARS47.RDS_CONNECTION );
  const eligible = Roles.eligibleRoles( int.guild, records );

  if ( eligible.length === 0 ) {
    await int.editReply( {
      content: records.length === 0
        ? 'No self-assignable roles are configured. A flag officer can open some up with `/role add`.'
        : 'Every configured role is currently unavailable. A flag officer should run `/role list`.'
    } );
    return;
  }

  await int.editReply( {
    content: renderPrompt( eligible.length ),
    components: buildMenus( eligible, member )
  } );
}

/**
 * Apply a menu submission.
 *
 * The page is recomputed from the allowlist rather than trusted from the menu,
 * and every chosen id is checked against that fresh result - see the note at
 * the top of Roles_Utilities on why the menu is only ever a cache.
 */
async function handleSelect ( LCARS47: LCARSClient, int: StringSelectMenuInteraction ): Promise<void> {
  await int.deferUpdate();

  const member = int.member as GuildMember | null;
  if ( member == null || int.guild == null ) {
    await int.editReply( { content: 'Segment fault: unable to identify member role manager.', components: [] } );
    return;
  }

  const page = Number( int.customId.split( '_' )[2] );
  const records = await Roles.listSelfRoles( LCARS47.RDS_CONNECTION );
  const eligible = Roles.eligibleRoles( int.guild, records );
  const pages = Roles.pageRoles( eligible );

  // The allowlist can shrink while a menu sits open. If the page it belongs to
  // is gone there is nothing coherent to diff against, so re-render instead of
  // guessing.
  if ( !Number.isInteger( page ) || pages[page] == null ) {
    await int.editReply( {
      content: 'That menu is out of date - the role list changed. Run `/role select` again.',
      components: []
    } );
    return;
  }

  const pageRoles = pages[page];
  const chosen = new Set( int.values );

  // Scoped strictly to this page. Diffing against the whole allowlist would
  // strip every role the member holds from any OTHER menu in the message, since
  // those ids were never in this submission's values.
  const toAdd = pageRoles.filter( r => chosen.has( r.id ) && !member.roles.cache.has( r.id ) );
  const toRemove = pageRoles.filter( r => !chosen.has( r.id ) && member.roles.cache.has( r.id ) );

  const roleManager = member.roles;
  const failed: string[] = [];

  for ( const role of toAdd ) {
    try {
      await roleManager.add( role );
    }
    catch ( addErr ) {
      Utility.log( 'warn', `[ROLE-SYS] Unable to add ${ role.name }: ${ ( addErr as Error ).message }` );
      failed.push( role.name );
    }
  }

  for ( const role of toRemove ) {
    try {
      await roleManager.remove( role );
    }
    catch ( removeErr ) {
      Utility.log( 'warn', `[ROLE-SYS] Unable to remove ${ role.name }: ${ ( removeErr as Error ).message }` );
      failed.push( role.name );
    }
  }

  Utility.log(
    'info',
    `[ROLE-SYS] ${ member.user.username }: +${ toAdd.length } -${ toRemove.length } (page ${ page })`
  );

  // Re-render so the checkmarks match what the member now actually holds.
  const refreshed = await member.fetch( true );

  await int.editReply( {
    content: renderOutcome( toAdd, toRemove, failed ),
    components: buildMenus( eligible, refreshed )
  } );
}

// -- Flag officer controls --

async function addRole ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<void> {
  const member = int.member as GuildMember | null;
  if ( member == null || int.guild == null || !Auth.hasFlagAuthority( member, int.memberPermissions ) ) {
    await int.reply( { content: refusal(), flags: MessageFlags.Ephemeral } );
    return;
  }

  await int.deferReply( { flags: MessageFlags.Ephemeral } );

  const role = int.options.getRole( 'role-name' ) as Role;

  // The floor runs here too, not only at render time. Refusing to store a role
  // LCARS could never hand out is better than storing it and quietly hiding it
  // from every menu afterwards.
  const reason = Roles.ineligibilityReason( role, Roles.botHighestPosition( int.guild ) );
  if ( reason != null ) {
    await int.editReply( {
      content: `**${ role.name }** cannot be made self-assignable — ${ Roles.explainIneligibility( reason ) }.`
    } );
    return;
  }

  const added = await Roles.addSelfRole( LCARS47.RDS_CONNECTION, role, member.id );

  await int.editReply( {
    content: added
      ? `**${ role.name }** is now self-assignable.`
      : `**${ role.name }** was already on the list.`
  } );
}

async function removeRole ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<void> {
  const member = int.member as GuildMember | null;
  if ( member == null || !Auth.hasFlagAuthority( member, int.memberPermissions ) ) {
    await int.reply( { content: refusal(), flags: MessageFlags.Ephemeral } );
    return;
  }

  await int.deferReply( { flags: MessageFlags.Ephemeral } );

  const role = int.options.getRole( 'role-name' ) as Role;
  const removed = await Roles.removeSelfRole( LCARS47.RDS_CONNECTION, role.id );

  await int.editReply( {
    content: removed
      ? `**${ role.name }** is no longer self-assignable. Members already holding it keep it.`
      : `**${ role.name }** was not on the list.`
  } );
}

async function listRoles ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<void> {
  const member = int.member as GuildMember | null;
  if ( member == null || int.guild == null || !Auth.hasFlagAuthority( member, int.memberPermissions ) ) {
    await int.reply( { content: refusal(), flags: MessageFlags.Ephemeral } );
    return;
  }

  await int.deferReply( { flags: MessageFlags.Ephemeral } );

  const records = await Roles.listSelfRoles( LCARS47.RDS_CONNECTION );
  const resolved = Roles.resolveSelfRoles( int.guild, records );

  await int.editReply( { embeds: [ buildListEmbed( resolved ) ] } );
}

// -- Rendering --

/**
 * Build one select menu per page of eligible roles.
 *
 * Exported for the tests: the option cap, the pre-selected defaults and the
 * page-indexed customId are the three things that have to be right for the
 * handler above to diff correctly.
 */
export function buildMenus(
  eligible: Role[],
  member: GuildMember
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const pages = Roles.pageRoles( eligible );

  return pages.map( ( pageRoles, index ) => {
    const options = pageRoles.map( role => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel( role.name.slice( 0, LABEL_MAX ) )
        .setValue( role.id )
        // The reason this menu is ephemeral: it opens showing what you have.
        .setDefault( member.roles.cache.has( role.id ) );

      if ( role.unicodeEmoji != null ) option.setEmoji( { name: role.unicodeEmoji } );

      return option;
    } );

    const menu = new StringSelectMenuBuilder()
      .setCustomId( `role_select_${ index }` )
      .setPlaceholder( pages.length > 1 ? `Game roles (${ index + 1 } of ${ pages.length })` : 'Game roles' )
      // Zero is a valid answer - it means "remove everything on this page".
      .setMinValues( 0 )
      .setMaxValues( options.length )
      .addOptions( options );

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents( menu );
  } );
}

function renderPrompt ( count: number ): string {
  return `Select your game roles — ${ count } available. `
    + 'Roles you already hold are ticked; unticking one removes it.';
}

/** Summarise what a submission actually changed. */
export function renderOutcome ( added: Role[], removed: Role[], failed: string[] ): string {
  const lines: string[] = [];

  if ( added.length > 0 ) lines.push( `**Joined:** ${ added.map( r => r.name ).join( ', ' ) }` );
  if ( removed.length > 0 ) lines.push( `**Left:** ${ removed.map( r => r.name ).join( ', ' ) }` );
  if ( failed.length > 0 ) lines.push( `**Failed:** ${ failed.join( ', ' ) } — LCARS could not apply these.` );
  if ( lines.length === 0 ) lines.push( 'No changes — your roles are as they were.' );

  return lines.join( '\n' );
}

/**
 * Join lines into one embed field, trimmed to Discord's 1024 character cap.
 *
 * A long allowlist overflows this well before it overflows the picker - around
 * sixty roles, depending on name length - and the builder throws rather than
 * truncating for you. Losing the tail of a list is survivable; /role list
 * erroring out for the one officer who needs it is not.
 */
export function fitLines ( lines: string[] ): string {
  const joined = lines.join( '\n' );
  if ( joined.length <= FIELD_VALUE_MAX ) return joined;

  const kept: string[] = [];
  let length = 0;

  for ( const line of lines ) {
    // Reserve room for the overflow note, whose own length grows with the count.
    const note = `\n*…and ${ lines.length - kept.length } more.*`;
    if ( length + line.length + 1 + note.length > FIELD_VALUE_MAX ) break;

    kept.push( line );
    length += line.length + 1;
  }

  return `${ kept.join( '\n' ) }\n*…and ${ lines.length - kept.length } more.*`;
}

/**
 * Render the allowlist with its stale entries called out.
 *
 * The ineligible section is the point of this command: an entry that has gone
 * bad simply vanishes from the picker, so without somewhere to see it a flag
 * officer has no way to notice.
 */
export function buildListEmbed ( resolved: ResolvedSelfRole[] ): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle( '📋 Self-Assignable Roles' )
    .setColor( COLOUR_ROLES );

  if ( resolved.length === 0 ) {
    embed.setDescription( 'Nothing is self-assignable yet. Open a role up with `/role add`.' );
    return embed;
  }

  const eligible = resolved.filter( r => r.eligible );
  const blocked = resolved.filter( r => !r.eligible );

  embed.addFields( {
    name: `Available (${ eligible.length })`,
    value: eligible.length > 0
      ? fitLines( eligible.map( r => `• ${ r.role!.name }` ) )
      : '*None.*',
    inline: false
  } );

  if ( blocked.length > 0 ) {
    embed.addFields( {
      name: `Unavailable (${ blocked.length })`,
      value: fitLines( blocked.map(
        r => `• ${ r.role?.name ?? r.record.name } — ${ Roles.explainIneligibility( r.reason! ) }`
      ) ),
      inline: false
    } );
  }

  if ( resolved.length > Roles.MAX_RENDERABLE_ROLES ) {
    embed.setFooter( {
      text: `Only the first ${ Roles.MAX_RENDERABLE_ROLES } can be shown in the picker.`
    } );
  }

  return embed;
}

function refusal (): string {
  return 'Flag officer authority required. That console is above your paygrade.';
}

function help (): string {
  return 'Self-assign game roles. Flag officers control the list with add, remove and list.';
}

// Exports
export default {
  name: 'Role',
  data,
  execute,
  handleSelect,
  help
} satisfies Command;
