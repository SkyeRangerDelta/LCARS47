// -- AI Tools --
// Tool definitions and dispatcher for LCARS47's Claude-backed Computer command.
// Each handler wraps existing bot subsystems so the AI can answer real
// operational queries (now-playing, server status, uptime, etc.).

import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { type LCARSClient } from '../Auxiliary/LCARSClient.js';
import BeszelUtils from '../RemoteDS/Beszel_Utilities.js';
import Ship from '../Ship/Ship_Utilities.js';
import ShipMsg from '../Ship/Ship_Messages.js';
import Astro from '../Astrometrics/AstrometricsService.js';
import AstroConfig from '../Astrometrics/Astro_Config.js';
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
    name: 'get_ship_position',
    description: 'Retrieve the ship\'s current position: galactic coordinates, quadrant, sector designation, distance from the galactic core and from Sol, and any voyage under way with its course, velocity, progress and arrival time. Use when the user asks where the ship is, what sector or quadrant she is in, whether she is under way, how far to the destination, or when she arrives.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_astrometrics',
    description: 'Run a sensor sweep of the ship\'s current location: catalogued stars within sensor range with their range and bearing, plus sector readings (stellar density, particle density, background radiation, subspace conditions, anomalies). Use when the user asks what is nearby, what the sensors show, what stars are in range, or about local conditions.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'scan_object',
    description: 'Identify a named astronomical object - a star, system, planet or sector, canon or real - and give its range and bearing from the ship where one can be determined. Use when the user asks about a specific place: where Vulcan is, how far Wolf 359 is, what Bajor is.',
    input_schema: {
      type: 'object',
      properties: {
        object_name: {
          type: 'string',
          description: 'Name of the object to scan, e.g. "Vulcan", "Wolf 359", "Bajor".'
        }
      },
      required: ['object_name']
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
  object_name?: string;
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
      case 'get_ship_position':
        return await getShipPosition( ctx );
      case 'get_astrometrics':
        return await getAstrometrics( ctx );
      case 'scan_object':
        return await scanObject( ctx, input.object_name );
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

async function getShipPosition( ctx: ToolContext ): Promise<string> {
  const connection = ctx.client.RDS_CONNECTION;
  if ( connection == null ) return 'Navigational database unavailable.';

  const doc = await Ship.getShipPosition( connection );
  ctx.client.SHIP_POSITION = doc;

  const at = Ship.resolveShipPosition( doc, Date.now() );

  const lines = [
    `Status: ${ ShipMsg.statusLabel( at.status ) }`,
    `Position: ${ ShipMsg.formatSector( at.sector ) }`,
    `Galactic coordinates (light years, origin galactic centre): ${ ShipMsg.formatCoordinates( at.position ) }`,
    `Distance from galactic core: ${ at.distanceFromCoreLy.toFixed( 1 ) } ly`,
    `Distance from Sol: ${ at.distanceFromSolLy.toFixed( 2 ) } ly`,
    `Elevation: ${ ShipMsg.formatGalacticPlane( at.position.z ) }`
  ];

  if ( at.anchorage != null ) lines.push( `Anchorage: ${ at.anchorage }` );

  if ( at.transit != null ) {
    lines.push(
      `Course: ${ ShipMsg.formatCourse( at.transit.bearing, at.transit.mark ) }`,
      `Velocity: ${ ShipMsg.formatWarp( at.transit.warpFactor ) }`,
      `Run: ${ at.transit.travelledLy.toFixed( 2 ) } of ${ at.transit.totalDistanceLy.toFixed( 2 ) } ly`
        + ` (${ Math.round( at.transit.progress * 100 ) }% complete)`,
      `Time to arrival: ${ ShipMsg.formatDuration( at.transit.remainingMs ) }`
    );
  }

  return lines.join( '\n' );
}

async function getAstrometrics( ctx: ToolContext ): Promise<string> {
  const connection = ctx.client.RDS_CONNECTION;
  if ( connection == null ) return 'Navigational database unavailable.';

  const doc = await Ship.getShipPosition( connection );
  ctx.client.SHIP_POSITION = doc;

  const at = Ship.resolveShipPosition( doc, Date.now() );
  const report = await Astro.buildReport( at, AstroConfig.astrometricsOptions( connection ) );

  const lines = [
    `Position: ${ ShipMsg.formatSector( at.sector ) }`,
    `Sector readings (computed from survey data, not measured):`,
    `  Stellar density: ${ report.readings.stellarDensity }`
      + ` (~${ report.readings.starCount } stars, mostly class ${ report.readings.dominantSpectralClass })`,
    `  Particle density: ${ report.readings.particleDensityPerCm3 } per cm3`,
    `  Background radiation: ${ report.readings.backgroundRadiationMrem } mrem/h`,
    `  Subspace: ${ report.readings.subspaceConditions }`
  ];

  if ( report.readings.phenomenon != null ) {
    lines.push( `  Anomaly: ${ report.readings.phenomenon }` );
  }

  if ( report.neighbours.length > 0 ) {
    lines.push( `Catalogued objects within ${ Astro.SENSOR_RANGE_LY } light years:` );
    for ( const n of report.neighbours ) {
      lines.push(
        `  ${ n.name }: ${ n.distanceLy.toFixed( 2 ) } ly,`
        + ` bearing ${ ShipMsg.formatCourse( n.bearing, n.mark ) }`
        + `${ n.spectralType == null ? '' : `, ${ n.spectralType }` }`
      );
    }
  }

  if ( report.catalogueNote != null ) lines.push( `Note: ${ report.catalogueNote }` );

  return lines.join( '\n' );
}

async function scanObject( ctx: ToolContext, objectName?: string ): Promise<string> {
  if ( objectName == null || objectName.trim() === '' ) {
    return 'No object named. Specify what to scan.';
  }

  const connection = ctx.client.RDS_CONNECTION;
  if ( connection == null ) return 'Navigational database unavailable.';

  const doc = await Ship.getShipPosition( connection );
  const at = Ship.resolveShipPosition( doc, Date.now() );

  const result = await Astro.scan(
    objectName,
    at,
    AstroConfig.astrometricsOptions( connection )
  );

  const lines = [`Scan target: ${ result.query }`];

  if ( result.canon != null ) {
    lines.push(
      `Canon record: ${ result.canon.name }`
      + `${ result.canon.objectType == null ? '' : ` (${ result.canon.objectType })` }`
    );
    if ( result.canon.location != null ) lines.push( `Located within: ${ result.canon.location.name }` );
  }

  if ( result.fix != null ) {
    lines.push(
      `Stellar catalogue fix: ${ result.fix.name }`,
      `Range from ship: ${ result.fix.distanceLy.toFixed( 2 ) } ly`,
      `Bearing: ${ ShipMsg.formatCourse( result.fix.bearing, result.fix.mark ) }`
    );
    if ( result.fix.spectralType != null ) lines.push( `Spectral type: ${ result.fix.spectralType }` );
  }

  if ( result.note != null ) lines.push( result.note );

  return lines.join( '\n' );
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
