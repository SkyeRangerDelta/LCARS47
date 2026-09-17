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
  type Guild,
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
import type {
  EligibleSelfRole,
  ResolvedSelfRole,
  SelfRoleAddResult
} from '../../Subsystems/Auxiliary/Interfaces/RoleInterfaces.js';

// Constants
const COLOUR_ROLES = 0x66ccff;

/** Discord's cap on a select option label. */
const LABEL_MAX = 100;

/** Discord's cap on an embed field value. */
const FIELD_VALUE_MAX = 1024;

/** Discord's cap on a select option description. */
const DESCRIPTION_MAX = 100;

/** Discord's cap on a role name. */
const ROLE_NAME_MAX = 100;

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
  .addStringOption( o => o
    .setName( 'game' )
    .setDescription( 'Which game it belongs to, shown under the role in the picker.' )
    .setRequired( true )
    .setMaxLength( 100 )
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
  .setName( 'create' )
  .setDescription( 'Flag officers: create a new role and make it self-assignable in one step.' )
  .addStringOption( o => o
    .setName( 'name' )
    .setDescription( 'Name for the new role.' )
    .setRequired( true )
    .setMaxLength( ROLE_NAME_MAX )
  )
  .addStringOption( o => o
    .setName( 'game' )
    .setDescription( 'Which game it belongs to, shown under the role in the picker.' )
    .setRequired( true )
    .setMaxLength( DESCRIPTION_MAX )
  )
  .addStringOption( o => o
    .setName( 'colour' )
    .setDescription( 'Hex colour, e.g. #4f9dde. Defaults to no colour.' )
    .setRequired( false )
  )
  .addBooleanOption( o => o
    .setName( 'mentionable' )
    .setDescription( 'Allow members to ping this role. Defaults to no.' )
    .setRequired( false )
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
    case 'create':
      return await createRole( LCARS47, int );
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

  const pageEntries = pages[page];
  const chosen = new Set( int.values );

  // Scoped strictly to this page. Diffing against the whole allowlist would
  // strip every role the member holds from any OTHER menu in the message, since
  // those ids were never in this submission's values.
  const toAdd = pageEntries
    .filter( e => chosen.has( e.role.id ) && !member.roles.cache.has( e.role.id ) )
    .map( e => e.role );
  const toRemove = pageEntries
    .filter( e => !chosen.has( e.role.id ) && member.roles.cache.has( e.role.id ) )
    .map( e => e.role );

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

  const game = int.options.getString( 'game' ) ?? undefined;
  const result = await Roles.addSelfRole( LCARS47.RDS_CONNECTION, role, member.id, game );

  await int.editReply( { content: describeAdd( result, role.name, game ) } );
}

/**
 * Create a guild role and list it in one step.
 *
 * Exists because the two halves were always done together and doing them apart
 * is where mistakes creep in - a role created by hand and never listed just
 * quietly fails to appear in anyone's picker.
 */
async function createRole ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<void> {
  const member = int.member as GuildMember | null;
  if ( member == null || int.guild == null || !Auth.hasFlagAuthority( member, int.memberPermissions ) ) {
    await int.reply( { content: refusal(), flags: MessageFlags.Ephemeral } );
    return;
  }

  await int.deferReply( { flags: MessageFlags.Ephemeral } );

  const name = int.options.getString( 'name', true ).trim();
  const game = int.options.getString( 'game', true ).trim();
  const colourInput = int.options.getString( 'colour' );
  const mentionable = int.options.getBoolean( 'mentionable' ) ?? false;

  if ( name === '' ) {
    await int.editReply( { content: 'A role needs a name with something in it.' } );
    return;
  }

  // Discord permits duplicate role names, which would leave two identical
  // entries in the picker and no way to tell them apart. Refuse and point at
  // the command that does what they probably meant.
  const clash = findRoleByName( int.guild, name );
  if ( clash != null ) {
    await int.editReply( {
      content: `A role called **${ clash.name }** already exists. `
        + 'Use `/role add` to make that one self-assignable instead.'
    } );
    return;
  }

  let colour: number | undefined;
  if ( colourInput != null ) {
    const parsed = parseColour( colourInput );
    if ( parsed == null ) {
      await int.editReply( {
        content: `**${ colourInput }** is not a hex colour. Try something like \`#4f9dde\`.`
      } );
      return;
    }
    colour = parsed;
  }

  let role: Role;
  try {
    role = await int.guild.roles.create( {
      name,
      color: colour,
      mentionable,
      // A game role is a tag and nothing more. Omitting this copies @everyone's
      // permissions onto the new role, which can include ones the safety floor
      // then rejects - so the command would create a role it could not list.
      permissions: [],
      reason: `Self-assignable role created by ${ member.user.username } via LCARS /role create`
    } );
  }
  catch ( createErr ) {
    const err = createErr as Error;
    Utility.log( 'warn', `[ROLE-SYS] Unable to create ${ name }: ${ err.message }` );
    await int.editReply( { content: explainCreateFailure( err ) } );
    return;
  }

  Utility.log( 'info', `[ROLE-SYS] ${ member.user.username } created role ${ role.name } (${ role.id }).` );

  // Belt and braces. A freshly created role sits just above @everyone with no
  // permissions, so it should always clear the floor - but if it somehow does
  // not, saying so beats listing a role that will never render.
  const reason = Roles.ineligibilityReason( role, Roles.botHighestPosition( int.guild ) );
  if ( reason != null ) {
    await int.editReply( {
      content: `Created **${ role.name }**, but it cannot be made self-assignable — `
        + `${ Roles.explainIneligibility( reason ) }. It has been left off the list.`
    } );
    return;
  }

  await Roles.addSelfRole( LCARS47.RDS_CONNECTION, role, member.id, game );

  await int.editReply( { content: describeCreated( role.name, game ) } );
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
  eligible: EligibleSelfRole[],
  member: GuildMember
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const pages = Roles.pageRoles( eligible );

  return pages.map( ( pageEntries, index ) => {
    const options = pageEntries.map( ( { role, record } ) => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel( role.name.slice( 0, LABEL_MAX ) )
        .setValue( role.id )
        // The reason this menu is ephemeral: it opens showing what you have.
        .setDefault( member.roles.cache.has( role.id ) );

      // The whole point of storing the game: "Belt Repairman" means nothing on
      // its own, and Discord renders this as a subtitle under the role name.
      if ( record.game != null && record.game !== '' ) {
        option.setDescription( record.game.slice( 0, DESCRIPTION_MAX ) );
      }

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

/**
 * Parse a hex colour into the integer Discord wants.
 *
 * Accepts `#rrggbb`, `rrggbb`, and the three digit shorthand. Returns null on
 * anything else so the caller can show the input back rather than silently
 * creating a black role.
 */
export function parseColour ( input: string ): number | null {
  const hex = input.trim().replace( /^#/, '' );

  if ( /^[0-9a-f]{6}$/i.test( hex ) ) return parseInt( hex, 16 );

  // #abc means #aabbcc.
  if ( /^[0-9a-f]{3}$/i.test( hex ) ) {
    const expanded = hex.split( '' ).map( c => c + c ).join( '' );
    return parseInt( expanded, 16 );
  }

  return null;
}

/**
 * Find an existing role by name, ignoring case.
 *
 * Discord allows duplicate role names, so this is the only thing stopping
 * /role create from producing a second indistinguishable entry in the picker.
 */
export function findRoleByName ( guild: Guild, name: string ): Role | undefined {
  const wanted = name.trim().toLowerCase();
  return guild.roles.cache.find( r => r.name.toLowerCase() === wanted );
}

/** Turn a role creation failure into something an officer can act on. */
export function explainCreateFailure ( err: Error ): string {
  const code = ( err as { code?: number } ).code;

  if ( code === 50013 || err.message.includes( 'Missing Permissions' ) ) {
    return 'LCARS lacks the Manage Roles permission, so it cannot create roles.';
  }

  if ( code === 30005 ) {
    return 'This server has hit Discord\'s 250 role limit. Something has to go first.';
  }

  return `Role creation failed — ${ err.message }`;
}

/** Confirmation for a role that was created and listed in one go. */
export function describeCreated ( roleName: string, game: string ): string {
  return `Created **${ roleName }** and made it self-assignable under **${ game }**.`;
}

/**
 * Word the outcome of /role add.
 *
 * Distinguishing "already listed" from "relabelled" matters: re-running the
 * command is how a game label gets corrected, so an officer fixing a typo needs
 * to see that something actually changed.
 */
export function describeAdd ( result: SelfRoleAddResult, roleName: string, game?: string ): string {
  const suffix = game != null && game !== '' ? ` under **${ game }**` : '';

  switch ( result ) {
    case 'added':
      return `**${ roleName }** is now self-assignable${ suffix }.`;
    case 'updated':
      return `**${ roleName }** was already listed — relabelled${ suffix }.`;
    case 'unchanged':
      return `**${ roleName }** was already listed${ suffix }. Nothing changed.`;
  }
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

/** " (Factorio)", or nothing at all for an entry with no game on record. */
function gameSuffix ( entry: ResolvedSelfRole ): string {
  const game = entry.record.game;
  return game != null && game !== '' ? ` (${ game })` : '';
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
      ? fitLines( eligible.map( r => `• ${ r.role!.name }${ gameSuffix( r ) }` ) )
      : '*None.*',
    inline: false
  } );

  if ( blocked.length > 0 ) {
    embed.addFields( {
      name: `Unavailable (${ blocked.length })`,
      value: fitLines( blocked.map(
        r => `• ${ r.role?.name ?? r.record.name }${ gameSuffix( r ) } — `
          + Roles.explainIneligibility( r.reason! )
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
  return 'Self-assign game roles. Flag officers control the list with create, add, remove and list.';
}

// Exports
export default {
  name: 'Role',
  data,
  execute,
  handleSelect,
  help
} satisfies Command;
