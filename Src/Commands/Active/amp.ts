// -- AMP --
// Game server control via the CubeCoders AMP controller on Impulse Controller.
//
// Gating note: /amp is only *partly* privileged — list and status are open to
// everyone, start and stop are not. setDefaultMemberPermissions() applies to
// the whole command, so using it here would hide the read-only subcommands
// from ordinary users too. The runtime isAdminUser() check in handleAction()
// is therefore the only gate on the destructive paths; do not remove it in
// favour of a builder-level permission.

// Imports
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { isAdminUser } from '../../Subsystems/Utilities/AuthUtils.js';
import { AMPError, type AMPClient } from '../../Subsystems/AMP/AMPClient.js';
import {
  formatMetric,
  formatUptime,
  isTransitional,
  stateColour,
  stateEmoji,
  stateLabel
} from '../../Subsystems/AMP/AMPFormat.js';
import type { AMPInstance, AMPStatus } from '../../Subsystems/AMP/AMPInterfaces.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface.js';

// AMP accepts a start/stop immediately and works on it in the background, so
// the command polls for a terminal state rather than claiming success.
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 10;

/** States that end a start poll. */
const START_TERMINAL = new Set( [20, 80, 100] );
/** States that end a stop poll. */
const STOP_TERMINAL = new Set( [0, 50, 100] );

// Discord caps an embed at 25 fields; AMP modules publish arbitrary metric dicts.
const MAX_EMBED_FIELDS = 25;
const MAX_DESCRIPTION = 4000;

// Command Data
const data = new SlashCommandBuilder()
  .setName( 'amp' )
  .setDescription( 'Control game server instances on the Impulse Controller.' );

// Subcommand: list
data.addSubcommand( s => s
  .setName( 'list' )
  .setDescription( 'List every game server instance and its current state' )
);

// Subcommand: status
data.addSubcommand( s => s
  .setName( 'status' )
  .setDescription( 'Show live statistics for one game server instance' )
  .addStringOption( o => o
    .setName( 'instance' )
    .setDescription( 'Instance to inspect' )
    .setAutocomplete( true )
    .setRequired( true )
  )
);

// Subcommand: start
data.addSubcommand( s => s
  .setName( 'start' )
  .setDescription( 'Start a game server instance (admin only)' )
  .addStringOption( o => o
    .setName( 'instance' )
    .setDescription( 'Instance to start' )
    .setAutocomplete( true )
    .setRequired( true )
  )
);

// Subcommand: stop
data.addSubcommand( s => s
  .setName( 'stop' )
  .setDescription( 'Stop a game server instance (admin only)' )
  .addStringOption( o => o
    .setName( 'instance' )
    .setDescription( 'Instance to stop' )
    .setAutocomplete( true )
    .setRequired( true )
  )
);

// Main execute function
async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<unknown> {
  // Autocomplete must be handled first — this framework routes both interaction
  // kinds through execute(), and getSubcommand() is not available on either.
  if ( int.isAutocomplete() ) {
    return await handleAutocomplete( LCARS47, int );
  }

  if ( !int.isChatInputCommand() ) return;

  const amp = LCARS47.AMP_CLIENT;
  if ( amp == null ) {
    return await int.reply( {
      content: 'AMP integration is not configured or failed to initialise. Check the engineering log.',
      flags: MessageFlags.Ephemeral
    } );
  }

  const subCmd = int.options.getSubcommand();

  switch ( subCmd ) {
    case 'list':
      await int.deferReply();
      return await handleList( amp, int );

    case 'status':
      await int.deferReply();
      return await handleStatus( amp, int );

    case 'start':
    case 'stop':
      // Ephemeral: a permission refusal or a raw AMP fault message should not
      // land in the channel.
      await int.deferReply( { flags: MessageFlags.Ephemeral } );
      return await handleAction( amp, int, subCmd );

    default:
      return await int.reply( {
        content: 'Unknown AMP command.',
        flags: MessageFlags.Ephemeral
      } );
  }
}

/**
 * Autocomplete runs against a hard ~3s deadline that cannot be deferred, so
 * this path is cache-only: never force a refresh, never trigger a login, and
 * never let an error escape.
 */
async function handleAutocomplete (
  LCARS47: LCARSClient,
  int: AutocompleteInteraction
): Promise<void> {
  const amp = LCARS47.AMP_CLIENT;
  if ( amp == null || !amp.isReady() ) return await int.respond( [] );

  try {
    const focused = int.options.getFocused().toLowerCase();
    const instances = await amp.listInstances();

    const choices = instances
      .filter( i =>
        i.friendlyName.toLowerCase().includes( focused )
        || i.instanceName.toLowerCase().includes( focused )
      )
      .map( i => ( {
        name: `${ stateEmoji( i.appState ) } ${ i.friendlyName } — ${ stateLabel( i.appState ) }`.slice( 0, 100 ),
        value: i.instanceId
      } ) );

    return await int.respond( choices.slice( 0, 25 ) );
  }
  catch ( err ) {
    Utility.log( 'err', `[AMP] Autocomplete failed: ${ ( err as Error ).message }` );
    return await int.respond( [] );
  }
}

async function handleList ( amp: AMPClient, int: ChatInputCommandInteraction ): Promise<unknown> {
  try {
    const instances = await amp.listInstances();

    if ( instances.length === 0 ) {
      return await int.editReply( 'The Impulse Controller reports no game server instances.' );
    }

    const lines = instances.map( i =>
      `${ stateEmoji( i.appState ) } **${ i.friendlyName }** — ${ stateLabel( i.appState ) }`
      + ( i.moduleDisplayName === '' ? '' : ` \`${ i.moduleDisplayName }\`` )
    );

    const running = instances.filter( i => i.appState === 20 ).length;
    const ageMs = amp.instanceCacheAgeMs() ?? 0;

    const embed = new EmbedBuilder()
      .setTitle( '🎮 Impulse Controller — Game Servers' )
      .setColor( running > 0 ? 0x00FF00 : 0x808080 )
      .setDescription( truncate( lines.join( '\n' ), MAX_DESCRIPTION ) )
      .setFooter( {
        text: `${ running }/${ instances.length } running • data ${ Math.round( ageMs / 1000 ) }s old • Stardate ${ Utility.stardate() }`
      } )
      .setTimestamp();

    return await int.editReply( { embeds: [embed] } );
  }
  catch ( err ) {
    return await int.editReply( describeError( err, 'list the instances' ) );
  }
}

async function handleStatus ( amp: AMPClient, int: ChatInputCommandInteraction ): Promise<unknown> {
  const selector = int.options.getString( 'instance', true );

  try {
    const instance = await amp.findInstance( selector );
    if ( instance == null ) {
      return await int.editReply( `No AMP instance matches \`${ selector }\`.` );
    }

    const status = await amp.getInstanceStatus( instance );
    return await int.editReply( { embeds: [buildStatusEmbed( instance, status )] } );
  }
  catch ( err ) {
    return await int.editReply( describeError( err, 'read that instance' ) );
  }
}

async function handleAction (
  amp: AMPClient,
  int: ChatInputCommandInteraction,
  action: 'start' | 'stop'
): Promise<unknown> {
  if ( !isAdminUser( int.user.id, int.memberPermissions ) ) {
    return await int.editReply( 'Not authorised. Starting and stopping game servers is restricted.' );
  }

  const selector = int.options.getString( 'instance', true );

  try {
    const instance = await amp.findInstance( selector );
    if ( instance == null ) {
      return await int.editReply( `No AMP instance matches \`${ selector }\`.` );
    }

    const before = await amp.getInstanceStatus( instance );

    // Skip the pointless cases rather than issuing a no-op and polling for 30s.
    if ( action === 'start' && ( before.state === 20 || before.state === 10 || before.state === 5 ) ) {
      return await int.editReply( {
        content: `**${ instance.friendlyName }** is already ${ stateLabel( before.state ).toLowerCase() }.`,
        embeds: [buildStatusEmbed( instance, before )]
      } );
    }
    if ( action === 'stop' && ( before.state === 0 || before.state === 50 ) ) {
      return await int.editReply( {
        content: `**${ instance.friendlyName }** is already ${ stateLabel( before.state ).toLowerCase() }.`,
        embeds: [buildStatusEmbed( instance, before )]
      } );
    }

    Utility.log( 'info', `[AMP] ${ action } requested for ${ instance.friendlyName } by ${ int.user.id }.` );

    if ( action === 'start' ) {
      await amp.startInstance( instance );
    }
    else {
      await amp.stopInstance( instance );
    }

    // The cached AppState is now wrong; the next autocomplete should not show it.
    amp.invalidateInstanceCache();

    await int.editReply(
      `${ action === 'start' ? 'Start' : 'Stop' } command accepted for **${ instance.friendlyName }**. Standing by…`
    );

    const terminal = action === 'start' ? START_TERMINAL : STOP_TERMINAL;
    const final = await pollForState( amp, instance, terminal );

    if ( final == null ) {
      return await int.editReply(
        `**${ instance.friendlyName }** did not report back in time. Run \`/amp status\` to check on it.`
      );
    }

    if ( !terminal.has( final.state ) ) {
      // Poll budget ran out mid-transition. That is not a failure — say so plainly.
      return await int.editReply( {
        content: `**${ instance.friendlyName }** is still *${ stateLabel( final.state ) }*.`
          + ' Large worlds take a while — run `/amp status` to check on it.',
        embeds: [buildStatusEmbed( instance, final )]
      } );
    }

    const verdict = final.state === 100
      ? `**${ instance.friendlyName }** failed to ${ action }.`
      : `**${ instance.friendlyName }** is now *${ stateLabel( final.state ) }*.`;

    return await int.editReply( { content: verdict, embeds: [buildStatusEmbed( instance, final )] } );
  }
  catch ( err ) {
    return await int.editReply( describeError( err, `${ action } that instance` ) );
  }
}

/**
 * Poll until the instance reaches a terminal state or the budget runs out.
 * Returns the last status read, or null if every poll failed.
 */
async function pollForState (
  amp: AMPClient,
  instance: AMPInstance,
  terminal: ReadonlySet<number>
): Promise<AMPStatus | null> {
  let last: AMPStatus | null = null;

  for ( let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++ ) {
    await sleep( POLL_INTERVAL_MS );

    try {
      last = await amp.getInstanceStatus( instance );
    }
    catch ( err ) {
      // A single failed poll is not fatal — AMP is busy restarting the app.
      Utility.log( 'warn', `[AMP] Poll failed for ${ instance.friendlyName }: ${ ( err as Error ).message }` );
      continue;
    }

    if ( terminal.has( last.state ) ) return last;
    if ( !isTransitional( last.state ) && last.state !== 60 ) return last;
  }

  return last;
}

/** Build the status embed. Exported so the layout can be unit tested. */
export function buildStatusEmbed ( instance: AMPInstance, status: AMPStatus ): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle( `${ stateEmoji( status.state ) } ${ instance.friendlyName }` )
    .setColor( stateColour( status.state ) )
    .setFooter( { text: `Impulse Controller • CubeCoders AMP • Stardate ${ Utility.stardate() }` } )
    .setTimestamp();

  const description = instance.description ?? instance.moduleDisplayName;
  if ( description !== '' ) embed.setDescription( description );

  embed.addFields(
    { name: 'State', value: stateLabel( status.state ), inline: true },
    { name: 'Uptime', value: formatUptime( status.uptime ), inline: true },
    { name: 'Module', value: instance.moduleDisplayName === '' ? '—' : instance.moduleDisplayName, inline: true }
  );

  if ( instance.ip != null && instance.port != null ) {
    embed.addFields( { name: 'Address', value: `\`${ instance.ip }:${ instance.port }\``, inline: true } );
  }

  if ( instance.diskUsageMB != null ) {
    embed.addFields( { name: 'Disk', value: `${ instance.diskUsageMB } MB`, inline: true } );
  }

  // AMP modules publish arbitrary metric dictionaries, so iterate rather than
  // reaching for known key names — and stop before Discord's 25-field cap.
  for ( const [name, metric] of Object.entries( status.metrics ) ) {
    if ( embed.data.fields != null && embed.data.fields.length >= MAX_EMBED_FIELDS ) break;
    embed.addFields( { name, value: formatMetric( name, metric ), inline: true } );
  }

  return embed;
}

/** Turn an AMPError kind into something a human can act on. */
function describeError ( err: unknown, attempted: string ): string {
  if ( err instanceof AMPError ) {
    switch ( err.kind ) {
      case 'unauthorized':
        return `The AMP service account is not permitted to ${ attempted }.\n\`${ err.message }\``;
      case 'not-found':
        return 'That instance no longer exists on the controller. The cached list has been refreshed.';
      case 'timeout':
      case 'network':
        return `The Impulse Controller did not respond${ err.detail == null ? '' : ` (${ err.detail })` }.`;
      case 'auth-failed':
        return `AMP rejected the LCARS service account: ${ err.message }`;
      default:
        return `AMP refused the request: ${ err.message }`;
    }
  }

  Utility.log( 'err', `[AMP] Unexpected failure while trying to ${ attempted }: ${ String( err ) }` );
  return `Failed to ${ attempted }.`;
}

function truncate ( text: string, max: number ): string {
  return text.length <= max ? text : `${ text.slice( 0, max - 1 ) }…`;
}

async function sleep ( ms: number ): Promise<void> {
  await new Promise<void>( resolve => setTimeout( resolve, ms ) );
}

function help (): string {
  return 'Control game server instances on the Impulse Controller (CubeCoders AMP).\n'
    + '`/amp list` — every instance and its state.\n'
    + '`/amp status <instance>` — live state, uptime and metrics.\n'
    + '`/amp start <instance>` / `/amp stop <instance>` — admin only. AMP works asynchronously, '
    + 'so the reply follows the instance until it settles.';
}

export default {
  name: 'amp',
  data,
  execute,
  help
} satisfies Command;
