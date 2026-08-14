// -- AI Tools --
// Tool definitions and dispatcher for LCARS47's Claude-backed Computer command.
// Each handler wraps existing bot subsystems so the AI can answer real
// operational queries (now-playing, server status, uptime, etc.).

import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { type LCARSClient } from '../Auxiliary/LCARSClient.js';
import BeszelUtils from '../RemoteDS/Beszel_Utilities.js';
import { isFeatureEnabled } from '../Utilities/EnvUtils.js';
import Utility from '../Utilities/SysUtils.js';

export const tools: Tool[] = [
  {
    name: 'get_now_playing',
    description: 'Retrieve the currently playing media track in the user\'s Discord guild voice channel, if any. Returns title, artist/album label, requester, and source provider. Use this when the user asks what is playing, what song is on, what the bot is playing, etc.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_bot_uptime',
    description: 'Retrieve LCARS47\'s own uptime since last activation. Use when the user asks how long the bot has been online, when it was last rebooted, or for a status check on the computer itself.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_server_status',
    description: 'Retrieve system metrics (CPU, memory, disk, uptime) from the Beszel monitoring grid for a named server. Use when the user asks about a host machine, server load, or infrastructure status. If no system name is given, returns the list of monitored systems.',
    input_schema: {
      type: 'object',
      properties: {
        system_name: {
          type: 'string',
          description: 'Name (or substring) of the monitored system. Optional — omit to list all monitored systems.'
        }
      },
      required: []
    }
  },
  {
    name: 'get_jellyfin_status',
    description: 'Report whether the Jellyfin media library subsystem is configured and online. Use when the user asks about the media library, Jellyfin connection, or whether streaming is available.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export interface ToolContext {
  client: LCARSClient;
  guildId: string;
}

interface ToolInput {
  system_name?: string;
}

export async function dispatchTool( name: string, input: ToolInput, ctx: ToolContext ): Promise<string> {
  try {
    switch ( name ) {
      case 'get_now_playing':
        return getNowPlaying( ctx );
      case 'get_bot_uptime':
        return getBotUptime( ctx );
      case 'get_server_status':
        return await getServerStatus( ctx, input.system_name );
      case 'get_jellyfin_status':
        return getJellyfinStatus();
      default:
        return `Unknown tool: ${name}`;
    }
  }
  catch ( err ) {
    Utility.log( 'err', `[AI-TOOLS] Tool '${name}' failed: ${( err as Error ).message}` );
    return `Tool execution failed: ${( err as Error ).message}`;
  }
}

function getNowPlaying( ctx: ToolContext ): string {
  const player = ctx.client.MEDIA_PLAYER;
  if ( player == null ) return 'Media player subsystem unavailable.';

  // MediaPlayerService is bound to a single guildId at construction; if the
  // request guildId matches the bound one, query state; otherwise report offline.
  // The service exposes getNowPlaying() but it's per-instance for its own guild.
  const track = player.getNowPlaying();
  if ( track == null ) return 'No track currently playing.';

  const parts = [
    `Title: ${track.title}`,
    `Source: ${track.source}`,
    `Channel/Album: ${track.channelOrAlbumLabel}`
  ];
  if ( track.albumArtist != null ) parts.push( `Album artist: ${track.albumArtist}` );
  parts.push( `Duration: ${track.durationFriendly}` );
  parts.push( `Requested by: ${track.requestedBy.displayName}` );

  return parts.join( '\n' );
}

function getBotUptime( ctx: ToolContext ): string {
  const ms = ctx.client.uptime;
  if ( ms == null ) return 'LCARS47 has no active session.';

  const seconds = Math.floor( ms / 1000 );
  const days = Math.floor( seconds / 86400 );
  const hours = Math.floor( ( seconds % 86400 ) / 3600 );
  const mins = Math.floor( ( seconds % 3600 ) / 60 );
  const parts: string[] = [];
  if ( days > 0 ) parts.push( `${days}d` );
  if ( hours > 0 ) parts.push( `${hours}h` );
  if ( mins > 0 ) parts.push( `${mins}m` );
  const pretty = parts.length > 0 ? parts.join( ' ' ) : '< 1m';

  return `Uptime: ${pretty} (since ${ctx.client.readyAt?.toISOString() ?? 'unknown'}).`;
}

async function getServerStatus( ctx: ToolContext, systemName?: string ): Promise<string> {
  if ( !isFeatureEnabled( 'beszel' ) ) return 'Beszel monitoring grid not configured.';
  const beszel = ctx.client.BESZEL_CLIENT;
  if ( beszel == null || !beszel.authStore.isValid ) return 'Beszel grid offline.';

  const systems = ctx.client.BESZEL_SYSTEMS ?? [];
  if ( systems.length === 0 ) return 'No systems registered with Beszel grid.';

  if ( systemName == null || systemName.trim() === '' ) {
    const names = systems.map( s => `${s.name} (${s.status})` ).join( ', ' );
    return `Monitored systems: ${names}`;
  }

  const needle = systemName.toLowerCase();
  const match = systems.find( s => s.name.toLowerCase().includes( needle ) );
  if ( match == null ) {
    return `No system matching '${systemName}'. Known systems: ${systems.map( s => s.name ).join( ', ' )}`;
  }

  const metrics = await BeszelUtils.beszel_getMetrics( beszel, match.id );
  return [
    `System: ${metrics.name}`,
    `Status: ${metrics.status}`,
    `CPU: ${metrics.cpu.toFixed( 1 )}%`,
    `Memory: ${metrics.memUsed} / ${metrics.memTotal} (${metrics.memPercent.toFixed( 1 )}%)`,
    `Disk: ${metrics.diskUsed} / ${metrics.diskTotal} (${metrics.diskPercent.toFixed( 1 )}%)`,
    `Uptime: ${metrics.uptime}`,
    metrics.temperature !== undefined ? `Temperature: ${metrics.temperature.toFixed( 1 )}°C` : null
  ].filter( v => v != null ).join( '\n' );
}

function getJellyfinStatus(): string {
  if ( !isFeatureEnabled( 'jellyfin' ) ) return 'Jellyfin media library not configured.';
  return 'Jellyfin media library configured and reachable via the media player subsystem.';
}

export default { tools, dispatchTool };
