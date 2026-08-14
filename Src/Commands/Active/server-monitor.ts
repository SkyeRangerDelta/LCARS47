// -- SERVER-MONITOR --
// Inspect and mute the Beszel state-change monitor.
//
// Gating note: `status` is open to everyone, `mute` and `unmute` are not, so
// this command cannot use setDefaultMemberPermissions() — that would hide the
// whole command. The runtime isAdminUser() check is the only gate.

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
import { BeszelMonitor, type TrackedSystem } from '../../Subsystems/Monitors/BeszelMonitor.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface.js';

const DEFAULT_MUTE_MINUTES = 60;
const MAX_MUTE_MINUTES = 1440;
const MAX_DESCRIPTION = 4000;

const STATUS_ICON: Readonly<Record<string, string>> = {
  up: '🟢',
  down: '🔴',
  paused: '⚫',
  pending: '🟡'
};

// Command Data
const data = new SlashCommandBuilder()
  .setName( 'server-monitor' )
  .setDescription( 'Inspect the Beszel system state-change monitor.' );

// Subcommand: status
data.addSubcommand( s => s
  .setName( 'status' )
  .setDescription( 'Show what the monitor is watching and how' )
);

// Subcommand: mute
data.addSubcommand( s => s
  .setName( 'mute' )
  .setDescription( 'Suppress state-change alerts for a while (admin only)' )
  .addIntegerOption( o => o
    .setName( 'minutes' )
    .setDescription( `How long to stay quiet (default ${ DEFAULT_MUTE_MINUTES })` )
    .setMinValue( 1 )
    .setMaxValue( MAX_MUTE_MINUTES )
    .setRequired( false )
  )
);

// Subcommand: unmute
data.addSubcommand( s => s
  .setName( 'unmute' )
  .setDescription( 'Resume state-change alerts (admin only)' )
);

// Main execute function
async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<unknown> {
  if ( int.isAutocomplete() ) return await int.respond( [
    { name: 'This command does not support autocomplete.', value: 'none' }
  ] );

  if ( !int.isChatInputCommand() ) return;

  const monitor = LCARS47.BESZEL_MONITOR;
  if ( monitor == null ) {
    return await int.reply( {
      content: 'The Beszel monitor is not running. Check the engineering log.',
      flags: MessageFlags.Ephemeral
    } );
  }

  switch ( int.options.getSubcommand() ) {
    case 'status':
      return await int.reply( { embeds: [buildMonitorEmbed( monitor )] } );

    case 'mute':
      return await handleMute( monitor, int );

    case 'unmute':
      return await handleUnmute( monitor, int );

    default:
      return await int.reply( {
        content: 'Unknown server-monitor command.',
        flags: MessageFlags.Ephemeral
      } );
  }
}

async function handleMute ( monitor: BeszelMonitor, int: ChatInputCommandInteraction ): Promise<unknown> {
  if ( !isAdminUser( int.user.id, int.memberPermissions ) ) {
    return await int.reply( { content: 'Not authorised.', flags: MessageFlags.Ephemeral } );
  }

  const minutes = int.options.getInteger( 'minutes' ) ?? DEFAULT_MUTE_MINUTES;
  monitor.mute( minutes * 60_000 );

  Utility.log( 'info', `[BESZEL-MON] Alerts muted for ${ minutes }m by ${ int.user.id }.` );

  return await int.reply(
    `Beszel alerts muted for ${ minutes } minute${ minutes === 1 ? '' : 's' }.`
    + ' State changes are still tracked, just not announced.'
  );
}

async function handleUnmute ( monitor: BeszelMonitor, int: ChatInputCommandInteraction ): Promise<unknown> {
  if ( !isAdminUser( int.user.id, int.memberPermissions ) ) {
    return await int.reply( { content: 'Not authorised.', flags: MessageFlags.Ephemeral } );
  }

  monitor.unmute();
  Utility.log( 'info', `[BESZEL-MON] Alerts unmuted by ${ int.user.id }.` );

  return await int.reply( 'Beszel alerts resumed.' );
}

/** Build the monitor status embed. Exported so the layout can be unit tested. */
export function buildMonitorEmbed ( monitor: BeszelMonitor ): EmbedBuilder {
  const states = monitor.getKnownStates();
  const systems = [...states.values()].sort( ( a, b ) => a.name.localeCompare( b.name ) );

  const down = systems.filter( s => s.status !== 'up' ).length;
  const feed = monitor.isRealtime() ? 'Realtime subscription' : 'Polling (EventSource unavailable)';
  const muted = monitor.isMuted()
    ? `Muted for another ${ Math.ceil( monitor.muteRemainingMs() / 60_000 ) }m`
    : 'Active';

  const embed = new EmbedBuilder()
    .setTitle( '📡 Beszel State Monitor' )
    .setColor( down > 0 ? 0xFF0000 : 0x00FF00 )
    .addFields(
      { name: 'Feed', value: feed, inline: true },
      { name: 'Alerts', value: muted, inline: true },
      { name: 'Tracking', value: `${ systems.length } system${ systems.length === 1 ? '' : 's' }`, inline: true }
    )
    .setFooter( { text: `Beszel Monitoring System • Stardate ${ Utility.stardate() }` } )
    .setTimestamp();

  if ( systems.length > 0 ) {
    embed.setDescription( truncate( systems.map( describeSystem ).join( '\n' ), MAX_DESCRIPTION ) );
  }
  else {
    embed.setDescription( 'No systems are being tracked yet.' );
  }

  return embed;
}

function describeSystem ( system: TrackedSystem ): string {
  const icon = STATUS_ICON[system.status] ?? '⚪';
  return `${ icon } **${ system.name }** — ${ BeszelMonitor.describeHold( system.status, system.since ) }`;
}

function truncate ( text: string, max: number ): string {
  return text.length <= max ? text : `${ text.slice( 0, max - 1 ) }…`;
}

function help (): string {
  return 'Inspect the Beszel state-change monitor, which announces hosts going up or down.\n'
    + '`/server-monitor status` — feed type, mute state, and every tracked host.\n'
    + '`/server-monitor mute [minutes]` / `/server-monitor unmute` — admin only. '
    + 'Muting is held in memory, so a bot restart resumes alerts.';
}

export default {
  name: 'server-monitor',
  data,
  execute,
  help
} satisfies Command;
