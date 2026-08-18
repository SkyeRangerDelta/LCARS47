// -- AMP --
// Game server control via the CubeCoders AMP controller on Impulse Controller.
//
// AMP has two independently controllable layers, and this command keeps them
// separate because conflating them produces surprises:
//
//   /amp instance start|stop  -> the AMP instance daemon (the machine)
//   /amp server   start|stop  -> the game server running inside it (the service)
//
// Starting an instance deliberately does NOT start its game server; these
// instances are configured that way on purpose. The command does not paper over
// that — bringing a machine up is not the same as putting it into service, so
// the reply says what happened and points at the next step rather than guessing.
//
// The layers are not interchangeable at the protocol level either. An instance
// whose daemon is down cannot be reached through the proxy at all (AMP answers
// "Instance Unavailable"), so instance control has to go through the controller
// while application control has to go through the proxy.
//
// Gating note: /amp is only *partly* privileged — list and status are open to
// everyone, the control subcommands are not. setDefaultMemberPermissions()
// applies to the whole command, so using it here would hide the read-only
// subcommands from ordinary users too. The runtime isAdminUser() check is
// therefore the only gate on the destructive paths; do not remove it in favour
// of a builder-level permission.

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
  formatPlayers,
  formatUptime,
  instanceState,
  isTransitional,
  playerCount,
  stateColour,
  stateEmoji,
  stateLabel
} from '../../Subsystems/AMP/AMPFormat.js';
import { recordAMPAction, type AMPAuditOutcome } from '../../Subsystems/AMP/AMPAudit.js';
import type { AMPInstance, AMPStatus } from '../../Subsystems/AMP/AMPInterfaces.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface.js';

// AMP accepts control commands immediately and works on them in the background,
// so every action polls for a settled state rather than claiming success.
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 10;

/** Application states that end a server-start poll. */
const START_TERMINAL = new Set( [20, 80, 100] );
/** Application states that end a server-stop poll. */
const STOP_TERMINAL = new Set( [0, 50, 100] );

/** Application states meaning "the game server is up or on its way up". */
const APP_LIVE = new Set( [5, 10, 20] );

// Discord caps an embed at 25 fields; AMP modules publish arbitrary metric dicts.
const MAX_EMBED_FIELDS = 25;
const MAX_DESCRIPTION = 4000;

/** Ceiling on per-instance state probes issued by /amp list. */
const MAX_HYDRATED = 15;

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

// Group: instance — the AMP instance daemon
data.addSubcommandGroup( g => g
  .setName( 'instance' )
  .setDescription( 'Control the AMP instance itself, not the game server inside it' )
  .addSubcommand( s => s
    .setName( 'start' )
    .setDescription( 'Bring an AMP instance online (does not start its game server)' )
    .addStringOption( o => o
      .setName( 'instance' )
      .setDescription( 'Instance to bring online' )
      .setAutocomplete( true )
      .setRequired( true )
    )
  )
  .addSubcommand( s => s
    .setName( 'stop' )
    .setDescription( 'Take an AMP instance offline (its game server must be stopped first)' )
    .addStringOption( o => o
      .setName( 'instance' )
      .setDescription( 'Instance to take offline' )
      .setAutocomplete( true )
      .setRequired( true )
    )
  )
);

// Group: server — the application running inside an instance
data.addSubcommandGroup( g => g
  .setName( 'server' )
  .setDescription( 'Control the game server running inside an online AMP instance' )
  .addSubcommand( s => s
    .setName( 'start' )
    .setDescription( 'Start the game server inside an online instance' )
    .addStringOption( o => o
      .setName( 'instance' )
      .setDescription( 'Instance whose game server to start' )
      .setAutocomplete( true )
      .setRequired( true )
    )
  )
  .addSubcommand( s => s
    .setName( 'stop' )
    .setDescription( 'Stop the game server inside an online instance' )
    .addStringOption( o => o
      .setName( 'instance' )
      .setDescription( 'Instance whose game server to stop' )
      .setAutocomplete( true )
      .setRequired( true )
    )
  )
);

// Main execute function
async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<unknown> {
  // Autocomplete must be handled first — this framework routes both interaction
  // kinds through execute().
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

  const group = int.options.getSubcommandGroup( false );
  const sub = int.options.getSubcommand();

  if ( group == null ) {
    await int.deferReply();
    return sub === 'list'
      ? await handleList( amp, int )
      : await handleStatus( amp, int );
  }

  // Ephemeral: a permission refusal or a raw AMP fault message should not land
  // in the channel.
  await int.deferReply( { flags: MessageFlags.Ephemeral } );

  const action = sub as 'start' | 'stop';
  const layer = group === 'instance' ? 'instance' : 'server';

  if ( !isAdminUser( int.user.id, int.memberPermissions ) ) {
    // Worth recording: an attempt to control a game server by someone without
    // permission is exactly the kind of thing an audit trail exists for.
    await audit( LCARS47, int, layer, action, int.options.getString( 'instance', true ), 'denied' );
    return await int.editReply( 'Not authorised. Starting and stopping game servers is restricted.' );
  }

  return layer === 'instance'
    ? await handleInstanceAction( LCARS47, amp, int, action )
    : await handleServerAction( LCARS47, amp, int, action );
}

/** Post a control-action record. Never throws. */
async function audit (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction,
  layer: 'instance' | 'server',
  action: 'start' | 'stop',
  target: string,
  outcome: AMPAuditOutcome,
  detail?: string
): Promise<void> {
  await recordAMPAction( LCARS47, {
    layer,
    action,
    target,
    operator: int.user.displayName,
    operatorId: int.user.id,
    outcome,
    detail
  } );
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
      .map( i => {
        const view = instanceState( i.running, i.appState );
        return {
          name: `${ view.emoji } ${ i.friendlyName } — ${ view.label }`.slice( 0, 100 ),
          value: i.instanceId
        };
      } );

    return await int.respond( choices.slice( 0, 25 ) );
  }
  catch ( err ) {
    Utility.log( 'err', `[AMP] Autocomplete failed: ${ ( err as Error ).message }` );
    return await int.respond( [] );
  }
}

async function handleList ( amp: AMPClient, int: ChatInputCommandInteraction ): Promise<unknown> {
  try {
    const instances = await amp.listInstances( { force: true } );

    if ( instances.length === 0 ) {
      return await int.editReply( 'The Impulse Controller reports no game server instances.' );
    }

    const live = await hydrateStates( amp, instances );

    // Live status where we have it, the controller's view where we do not.
    const resolved = instances.map( i => {
      const status = live.get( i.instanceId ) ?? null;
      return { instance: i, status, state: status?.state ?? i.appState };
    } );

    const lines = resolved.map( ( { instance: i, status, state } ) => {
      const view = instanceState( i.running, state );
      const players = status == null ? null : playerCount( status.metrics );

      return `${ view.emoji } **${ i.friendlyName }** — ${ view.label }`
        // Only meaningful while the server is actually serving; a stopped one
        // reports zero, which reads as information it is not.
        + ( state === 20 && players != null ? ` · ${ formatPlayers( players ) }` : '' )
        + ( i.moduleDisplayName === '' ? '' : ` \`${ i.moduleDisplayName }\`` );
    } );

    const online = resolved.filter( r => r.instance.running ).length;
    const serving = resolved.filter( r => r.instance.running && r.state === 20 );

    const totalPlayers = serving.reduce( ( sum, r ) => {
      const players = r.status == null ? null : playerCount( r.status.metrics );
      return sum + ( players?.current ?? 0 );
    }, 0 );

    const embed = new EmbedBuilder()
      .setTitle( '🎮 Impulse Controller — Game Servers' )
      .setColor( serving.length > 0 ? 0x00FF00 : 0x808080 )
      .setDescription( truncate( lines.join( '\n' ), MAX_DESCRIPTION ) )
      .setFooter( {
        text: `${ online }/${ instances.length } instances online, ${ serving.length } serving`
          + ( totalPlayers > 0 ? ` • ${ totalPlayers } online now` : '' )
          + ` • Stardate ${ Utility.stardate() }`
      } )
      .setTimestamp();

    return await int.editReply( { embeds: [embed] } );
  }
  catch ( err ) {
    return await int.editReply( describeError( err, 'list the instances' ) );
  }
}

/**
 * Replace the controller's stale `appState` with the real one, for instances it
 * believes are up.
 *
 * The controller's aggregate lags reality badly (see AMPClient.listInstances),
 * so straight after a start or stop it will happily report the old application
 * state for a minute. Each online instance is asked directly instead — cheap,
 * because only a handful are ever up at once and their proxy sessions are
 * cached after the first call.
 *
 * Best effort throughout: a probe that fails leaves that instance showing the
 * aggregate's view rather than failing the whole listing.
 */
async function hydrateStates (
  amp: AMPClient,
  instances: AMPInstance[]
): Promise<Map<string, AMPStatus>> {
  const online = instances.filter( i => i.running );
  const live = new Map<string, AMPStatus>();

  // Guard against a fleet where everything is up at once — /amp list should not
  // turn into fifty round trips.
  if ( online.length === 0 || online.length > MAX_HYDRATED ) return live;

  let throttled = false;

  await Promise.all( online.map( async i => {
    // Once AMP has told us to back off, stop asking. Continuing to fan out is
    // how a short throttle turns into a long one.
    if ( throttled ) return;

    try {
      const status = await amp.probeInstance( i );
      // Absent from the map means "no live reading"; the caller falls back to
      // the controller's view rather than being handed a fabricated one.
      if ( status != null ) live.set( i.instanceId, status );
    }
    catch ( err ) {
      if ( err instanceof AMPError && err.kind === 'rate-limited' ) throttled = true;
      Utility.log( 'warn', `[AMP] State probe failed for ${ i.friendlyName }: ${ ( err as Error ).message }` );
    }
  } ) );

  return live;
}

async function handleStatus ( amp: AMPClient, int: ChatInputCommandInteraction ): Promise<unknown> {
  const selector = int.options.getString( 'instance', true );

  try {
    const instance = await amp.findInstance( selector );
    if ( instance == null ) {
      return await int.editReply( `No AMP instance matches \`${ selector }\`.` );
    }

    // Ask the instance itself rather than trusting the cached flag. An offline
    // instance has no daemon to proxy to and probeInstance reports that as
    // null, so this both answers the question and settles whether it is up.
    const status = await amp.probeInstance( instance );

    return status == null
      ? await int.editReply( { embeds: [buildOfflineEmbed( { ...instance, running: false, appState: -1 } )] } )
      : await int.editReply( { embeds: [buildStatusEmbed( instance, status )] } );
  }
  catch ( err ) {
    // The cached list can be a minute stale; the instance may have gone down
    // since. Same outcome, so say the same thing.
    if ( err instanceof AMPError && err.kind === 'unavailable' ) {
      amp.invalidateInstanceCache();
      return await int.editReply( `**${ selector }** is offline — its AMP instance is not running.` );
    }
    return await int.editReply( describeError( err, 'read that instance' ) );
  }
}

/** `/amp instance start|stop` — the AMP daemon, via the controller. */
async function handleInstanceAction (
  LCARS47: LCARSClient,
  amp: AMPClient,
  int: ChatInputCommandInteraction,
  action: 'start' | 'stop'
): Promise<unknown> {
  const selector = int.options.getString( 'instance', true );

  try {
    const instance = await amp.findInstance( selector );
    if ( instance == null ) {
      return await int.editReply( `No AMP instance matches \`${ selector }\`.` );
    }

    // The lock spans the poll as well as the call — see withInstanceLock.
    return await amp.withInstanceLock(
      instance,
      `being ${ action === 'start' ? 'started' : 'stopped' } by ${ int.user.displayName }`,
      async () => await runInstanceAction( LCARS47, amp, int, instance, action )
    );
  }
  catch ( err ) {
    await audit( LCARS47, int, 'instance', action, selector, 'failed', errorDetail( err ) );
    return await int.editReply( describeError( err, `${ action } that instance` ) );
  }
}

/** Body of an instance action. Runs holding the instance's action lock. */
async function runInstanceAction (
  LCARS47: LCARSClient,
  amp: AMPClient,
  int: ChatInputCommandInteraction,
  instance: AMPInstance,
  action: 'start' | 'stop'
): Promise<unknown> {
  const wantRunning = action === 'start';

  // Decide on live state, never on the cached instance flags. Those come from
  // the controller's aggregate, which lags by tens of seconds — long enough
  // that a second command issued right after the first would read the old
  // value and happily repeat an action that has already happened.
  const live = await amp.probeInstance( instance );
  const isOnline = live != null;

  if ( isOnline === wantRunning ) {
    return await int.editReply(
      `**${ instance.friendlyName }** is already ${ wantRunning ? 'online' : 'offline' }.`
    );
  }

  // Taking an instance down while its game server is still up risks an unclean
  // shutdown — world corruption on some modules. Make the operator stop the
  // service before switching off the machine.
  if ( action === 'stop' && live != null && APP_LIVE.has( live.state ) ) {
    return await int.editReply(
      `**${ instance.friendlyName }** still has its game server running`
      + ` (*${ stateLabel( live.state ) }*).\n`
      + 'Stop it first with `/amp server stop` so the world saves cleanly, then take the instance offline.'
    );
  }

  Utility.log( 'info', `[AMP] instance ${ action } requested for ${ instance.friendlyName } by ${ int.user.id }.` );

  if ( action === 'start' ) {
    await amp.startInstance( instance );
  }
  else {
    await amp.stopInstance( instance );
  }

  await int.editReply(
    `Instance ${ action } accepted for **${ instance.friendlyName }**. Standing by…`
  );

  if ( !wantRunning ) {
    const down = await pollForInstanceDown( amp, instance );

    await audit( LCARS47, int, 'instance', action, instance.friendlyName,
      down ? 'completed' : 'pending', down ? 'Instance is offline.' : 'Still shutting down when the wait elapsed.' );

    return await int.editReply( down
      ? `**${ instance.friendlyName }** is now offline.`
      : `**${ instance.friendlyName }** is still shutting down. Run \`/amp status\` to check on it.` );
  }

  const settled = await pollForInstanceUp( amp, instance );

  if ( settled == null ) {
    await audit( LCARS47, int, 'instance', action, instance.friendlyName,
      'pending', 'Had not come online when the wait elapsed.' );

    return await int.editReply(
      `**${ instance.friendlyName }** has not come online yet. Run \`/amp status\` to check on it.`
    );
  }

  await audit( LCARS47, int, 'instance', action, instance.friendlyName,
    'completed', `Instance online, game server ${ stateLabel( settled.state ) }. Not started.` );

  // Deliberately not chained: these instances are configured not to autostart
  // their application, and that is the desired behaviour. Say so plainly rather
  // than starting the game server on the operator's behalf.
  return await int.editReply( {
    content: `**${ instance.friendlyName }** is now online, game server *${ stateLabel( settled.state ) }*.`
      + ' It was **not** started — run `/amp server start` when you want it in service.',
    embeds: [buildStatusEmbed( instance, settled )]
  } );
}

/** `/amp server start|stop` — the application inside a running instance. */
async function handleServerAction (
  LCARS47: LCARSClient,
  amp: AMPClient,
  int: ChatInputCommandInteraction,
  action: 'start' | 'stop'
): Promise<unknown> {
  const selector = int.options.getString( 'instance', true );

  try {
    const instance = await amp.findInstance( selector );
    if ( instance == null ) {
      return await int.editReply( `No AMP instance matches \`${ selector }\`.` );
    }

    // The offline check lives inside the lock, on live state — see
    // runServerAction. Deciding it out here on the cached flag would reject an
    // instance that came up moments ago.
    //
    // The lock spans the poll as well as the call — see withInstanceLock.
    return await amp.withInstanceLock(
      instance,
      `having its game server ${ action === 'start' ? 'started' : 'stopped' } by ${ int.user.displayName }`,
      async () => await runServerAction( LCARS47, amp, int, instance, action )
    );
  }
  catch ( err ) {
    await audit( LCARS47, int, 'server', action, selector, 'failed', errorDetail( err ) );

    if ( err instanceof AMPError && err.kind === 'unavailable' ) {
      amp.invalidateInstanceCache();
      return await int.editReply(
        `**${ selector }** went offline. Bring the instance up with \`/amp instance start\` first.`
      );
    }
    return await int.editReply( describeError( err, `${ action } that game server` ) );
  }
}

/** Body of a game server action. Runs holding the instance's action lock. */
async function runServerAction (
  LCARS47: LCARSClient,
  amp: AMPClient,
  int: ChatInputCommandInteraction,
  instance: AMPInstance,
  action: 'start' | 'stop'
): Promise<unknown> {
  // Live, not cached — see the note in runInstanceAction.
  const before = await amp.probeInstance( instance );

  // There is no proxy route into an instance that is not running.
  if ( before == null ) {
    return await int.editReply(
      `**${ instance.friendlyName }** is offline, so there is no game server to ${ action }.\n`
      + 'Bring the instance up first with `/amp instance start`.'
    );
  }

  // Skip the pointless cases rather than issuing a no-op and polling for 30s.
  const alreadyThere = action === 'start'
    ? APP_LIVE.has( before.state )
    : before.state === 0 || before.state === 50;

  if ( alreadyThere ) {
    return await int.editReply( {
      content: `The game server on **${ instance.friendlyName }** is already ${ stateLabel( before.state ).toLowerCase() }.`,
      embeds: [buildStatusEmbed( instance, before )]
    } );
  }

  Utility.log( 'info', `[AMP] server ${ action } requested for ${ instance.friendlyName } by ${ int.user.id }.` );

  if ( action === 'start' ) {
    await amp.startApplication( instance );
  }
  else {
    await amp.stopApplication( instance );
  }

  await int.editReply(
    `Game server ${ action } accepted for **${ instance.friendlyName }**. Standing by…`
  );

  const terminal = action === 'start' ? START_TERMINAL : STOP_TERMINAL;
  const final = await pollForState( amp, instance, terminal );

  if ( final == null ) {
    await audit( LCARS47, int, 'server', action, instance.friendlyName,
      'pending', 'No status returned before the wait elapsed.' );

    return await int.editReply(
      `**${ instance.friendlyName }** did not report back in time. Run \`/amp status\` to check on it.`
    );
  }

  if ( !terminal.has( final.state ) ) {
    // Poll budget ran out mid-transition. That is not a failure — say so.
    await audit( LCARS47, int, 'server', action, instance.friendlyName,
      'pending', `Still ${ stateLabel( final.state ) } when the wait elapsed.` );

    return await int.editReply( {
      content: `The game server on **${ instance.friendlyName }** is still *${ stateLabel( final.state ) }*.`
        + ' Large worlds take a while — run `/amp status` to check on it.',
      embeds: [buildStatusEmbed( instance, final )]
    } );
  }

  const failed = final.state === 100;

  await audit( LCARS47, int, 'server', action, instance.friendlyName,
    failed ? 'failed' : 'completed', `Game server is ${ stateLabel( final.state ) }.` );

  const verdict = failed
    ? `The game server on **${ instance.friendlyName }** failed to ${ action }.`
    : `The game server on **${ instance.friendlyName }** is now *${ stateLabel( final.state ) }*.`;

  return await int.editReply( { content: verdict, embeds: [buildStatusEmbed( instance, final )] } );
}

/**
 * Wait for an instance to become reachable, and for its application state to
 * mean something.
 *
 * Deliberately does NOT poll ADSModule/GetInstances for the `Running` flag.
 * That aggregate is a slow snapshot on the controller — measured against
 * amp.pldyn.net it did not change once across 30 seconds while a direct
 * Core/GetStatus updated every 2 seconds. Polling it produces exactly the
 * symptom it is supposed to detect: a long window where the instance is up but
 * still reported as down or as Undefined.
 *
 * The proxy is the honest signal. It either answers or it does not, and when it
 * answers it hands back the true application state in the same call. A state of
 * -1 means the instance is up but has not settled yet, so that keeps waiting.
 *
 * Returns the settled status, or null if it never became reachable.
 */
async function pollForInstanceUp (
  amp: AMPClient,
  instance: AMPInstance
): Promise<AMPStatus | null> {
  let last: AMPStatus | null = null;

  for ( let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++ ) {
    await sleep( POLL_INTERVAL_MS );

    try {
      last = await amp.probeInstance( instance );
    }
    catch ( err ) {
      Utility.log( 'warn', `[AMP] Readiness probe failed for ${ instance.friendlyName }: ${ ( err as Error ).message }` );
      continue;
    }

    if ( last != null && last.state !== -1 ) return last;
  }

  return last;
}

/**
 * Wait for an instance to stop answering through the proxy. Same reasoning as
 * pollForInstanceUp: the proxy going quiet is authoritative, the controller's
 * `Running` flag is not.
 */
async function pollForInstanceDown (
  amp: AMPClient,
  instance: AMPInstance
): Promise<boolean> {
  for ( let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++ ) {
    await sleep( POLL_INTERVAL_MS );

    try {
      if ( await amp.probeInstance( instance ) == null ) return true;
    }
    catch ( err ) {
      Utility.log( 'warn', `[AMP] Shutdown probe failed for ${ instance.friendlyName }: ${ ( err as Error ).message }` );
    }
  }

  return false;
}

/**
 * Poll the application state until it settles or the budget runs out.
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

/**
 * Embed for an instance whose daemon is down. Everything shown comes from the
 * controller's own instance list, since there is nothing to query directly.
 */
export function buildOfflineEmbed ( instance: AMPInstance ): EmbedBuilder {
  const view = instanceState( instance.running, instance.appState );

  const embed = new EmbedBuilder()
    .setTitle( `${ view.emoji } ${ instance.friendlyName }` )
    .setColor( view.colour )
    .addFields(
      { name: 'State', value: view.label, inline: true },
      { name: 'Module', value: instance.moduleDisplayName === '' ? '—' : instance.moduleDisplayName, inline: true }
    )
    .setFooter( { text: `Impulse Controller • CubeCoders AMP • Stardate ${ Utility.stardate() }` } )
    .setTimestamp();

  const description = instance.description ?? instance.moduleDisplayName;
  if ( description !== '' ) embed.setDescription( description );

  if ( instance.suspended ) {
    embed.addFields( { name: 'Suspended', value: 'Yes — this instance cannot be started', inline: true } );
  }

  if ( instance.diskUsageMB != null ) {
    embed.addFields( { name: 'Disk', value: `${ instance.diskUsageMB } MB`, inline: true } );
  }

  return embed;
}

/** Build the live status embed. Exported so the layout can be unit tested. */
export function buildStatusEmbed ( instance: AMPInstance, status: AMPStatus ): EmbedBuilder {
  // Reaching this point means a Core/GetStatus succeeded, which proves the
  // daemon is up — so the application state is the whole story here.
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

  // No connect address here by design — see the note on AMPInstance.

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
      case 'unavailable':
        return 'That instance is offline — bring it up with `/amp instance start` first.';
      case 'busy':
        // Already names the instance and who holds it.
        return `${ err.message }\nWait for that to finish before trying again.`;
      case 'rate-limited':
        return 'AMP is temporarily refusing logins after too many in a short window.'
          + ' Give it a few minutes and try again.';
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

/** Short, non-leaky description of a failure for the audit record. */
function errorDetail ( err: unknown ): string {
  return err instanceof AMPError ? `${ err.kind }: ${ err.message }` : String( err );
}

function truncate ( text: string, max: number ): string {
  return text.length <= max ? text : `${ text.slice( 0, max - 1 ) }…`;
}

async function sleep ( ms: number ): Promise<void> {
  await new Promise<void>( resolve => setTimeout( resolve, ms ) );
}

function help (): string {
  return 'Control game server instances on the Impulse Controller (CubeCoders AMP).\n\n'
    + 'AMP has two layers and this command keeps them apart — the **instance** is the machine, '
    + 'the **server** is the game running on it. Starting an instance does not start its game server.\n\n'
    + '`/amp list` — every instance and its state.\n'
    + '`/amp status <instance>` — live state, uptime and metrics.\n'
    + '`/amp instance start|stop <instance>` — admin only. Brings the AMP instance itself up or down.\n'
    + '`/amp server start|stop <instance>` — admin only. Starts or stops the game server inside an '
    + 'instance that is already online.';
}

export default {
  name: 'amp',
  data,
  execute,
  help
} satisfies Command;
