// -- ASTROMETRICS --
// Shipboard sensors, reported against wherever the ship currently is.
//
// Open to everyone: this reads, it never moves anything.
//
// The report is honest about provenance. Position, sector and quadrant are
// computed exactly; nearby objects are real catalogue entries with measured
// positions; the sensor readings are generated from the sector and the embed
// says so. Blurring those together would be the easy thing and the wrong one.

// Imports
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import Utility from '../../Subsystems/Utilities/SysUtils.js';
import Ship from '../../Subsystems/Ship/Ship_Utilities.js';
import Msg from '../../Subsystems/Ship/Ship_Messages.js';
import Astro from '../../Subsystems/Astrometrics/AstrometricsService.js';
import Config from '../../Subsystems/Astrometrics/Astro_Config.js';
import Stapi from '../../Subsystems/Astrometrics/StapiProvider.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface.js';
import type {
  AstrometricsReport,
  ScanResult,
  StellarNeighbour
} from '../../Subsystems/Astrometrics/AstroInterfaces.js';

/** LCARS science blue. */
const COLOUR_REPORT = 0x99CCFF;
/** A scan that came back with nothing. */
const COLOUR_EMPTY = 0x808080;

const MAX_DESCRIPTION = 4000;

// Command Data
const data = new SlashCommandBuilder()
  .setName( 'astrometrics' )
  .setDescription( 'Shipboard sensor data for the ship\'s current position.' );

// Subcommand: report
data.addSubcommand( s => s
  .setName( 'report' )
  .setDescription( 'Full sensor sweep of the ship\'s present location.' )
);

// Subcommand: scan
data.addSubcommand( s => s
  .setName( 'scan' )
  .setDescription( 'Identify an object and, where possible, put a bearing and range on it.' )
  .addStringOption( o => o
    .setName( 'object' )
    .setDescription( 'A star, system, planet or sector — canon or real.' )
    .setAutocomplete( true )
    .setRequired( true )
  )
);

// Main execute function
async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<unknown> {
  if ( int.isAutocomplete() ) return await handleAutocomplete( int );

  if ( !int.isChatInputCommand() ) return;

  const subCmd = int.options.getSubcommand();
  Utility.log( 'info', `[ASTRO] Received ${ subCmd } from ${ int.user.tag }` );

  // Both branches hit Mongo and may hit two third-party catalogues, so ack
  // first rather than gambling on someone else's latency.
  await int.deferReply();

  switch ( subCmd ) {
    case 'report':
      return await handleReport( LCARS47, int );

    case 'scan':
      return await handleScan( LCARS47, int );

    default:
      return await int.editReply( { content: 'Unknown sensor request.' } );
  }
}

// -- Handlers --

async function handleAutocomplete ( int: AutocompleteInteraction ): Promise<unknown> {
  const focused = int.options.getFocused( true );
  if ( focused.name !== 'object' ) return await int.respond( [] );

  // suggestScanTargets swallows its own failures; this catch is for anything
  // that goes wrong on the way to it.
  try {
    return await int.respond(
      await Astro.suggestScanTargets( focused.value, Config.astrometricsOptions( null ) )
    );
  }
  catch ( err ) {
    Utility.log( 'err', `[ASTRO] Autocomplete failed: ${ ( err as Error ).message }` );
    return await int.respond( [] );
  }
}

async function handleReport (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction
): Promise<unknown> {
  const doc = await Ship.getShipPosition( LCARS47.RDS_CONNECTION );
  LCARS47.SHIP_POSITION = doc;

  const position = Ship.resolveShipPosition( doc, Date.now() );
  const report = await Astro.buildReport(
    position,
    Config.astrometricsOptions( LCARS47.RDS_CONNECTION )
  );

  return await int.editReply( { embeds: [buildReportEmbed( report )] } );
}

async function handleScan (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction
): Promise<unknown> {
  const query = int.options.getString( 'object', true );

  const doc = await Ship.getShipPosition( LCARS47.RDS_CONNECTION );
  LCARS47.SHIP_POSITION = doc;

  const position = Ship.resolveShipPosition( doc, Date.now() );
  const result = await Astro.scan(
    query,
    position,
    Config.astrometricsOptions( LCARS47.RDS_CONNECTION )
  );

  return await int.editReply( { embeds: [buildScanEmbed( result )] } );
}

// -- Embeds --
// Exported so the layout can be unit tested without a live interaction.

/** One line per catalogued object, with its range and bearing from the ship. */
function describeNeighbour ( neighbour: StellarNeighbour ): string {
  const type = neighbour.spectralType ?? neighbour.objectType ?? 'unclassified';

  return `**${ neighbour.name }** — ${ neighbour.distanceLy.toFixed( 2 ) } ly, `
    + `bearing ${ Msg.formatCourse( neighbour.bearing, neighbour.mark ) } · ${ type }`;
}

export function buildReportEmbed ( report: AstrometricsReport ): EmbedBuilder {
  const { position, readings } = report;

  const embed = new EmbedBuilder()
    .setTitle( '🔭 Astrometrics Report' )
    .setColor( COLOUR_REPORT )
    .addFields(
      { name: 'Position', value: Msg.formatSector( position.sector ), inline: true },
      {
        name: 'Coordinates',
        value: `\`${ Msg.formatCoordinates( position.position ) }\``,
        inline: true
      },
      {
        name: 'Galactic centre',
        value: `${ position.distanceFromCoreLy.toFixed( 1 ) } ly`,
        inline: true
      },
      { name: 'Sol', value: `${ position.distanceFromSolLy.toFixed( 2 ) } ly`, inline: true },
      { name: 'Elevation', value: Msg.formatGalacticPlane( position.position.z ), inline: true },
      {
        name: 'Status',
        value: `${ Msg.statusIcon( position.status ) } ${ Msg.statusLabel( position.status ) }`,
        inline: true
      },
      {
        name: 'Stellar density',
        value: `${ readings.stellarDensity }\n~${ readings.starCount } stars in sector · `
          + `mostly class ${ readings.dominantSpectralClass }`,
        inline: false
      },
      {
        name: 'Particle density',
        value: `${ readings.particleDensityPerCm3 } /cm³`,
        inline: true
      },
      {
        name: 'Background radiation',
        value: `${ readings.backgroundRadiationMrem } mrem/h`,
        inline: true
      },
      { name: 'Subspace', value: readings.subspaceConditions, inline: false }
    )
    .setFooter( {
      text: 'Stellar Cartography • readings computed from sector survey data'
        + ` • Stardate ${ Utility.stardate() }`
    } )
    .setTimestamp();

  if ( report.neighbours.length > 0 ) {
    embed.setDescription( truncate(
      `**Objects within ${ Astro.SENSOR_RANGE_LY } light years**\n`
      + report.neighbours.map( describeNeighbour ).join( '\n' ),
      MAX_DESCRIPTION
    ) );
  }

  if ( readings.phenomenon != null ) {
    embed.addFields( { name: 'Anomaly', value: readings.phenomenon, inline: false } );
  }

  if ( report.catalogueNote != null ) {
    embed.addFields( { name: 'Sensor note', value: report.catalogueNote, inline: false } );
  }

  return embed;
}

export function buildScanEmbed ( result: ScanResult ): EmbedBuilder {
  const { canon, fix } = result;
  const found = canon != null || fix != null;

  const embed = new EmbedBuilder()
    .setTitle( `🔎 Sensor Scan — ${ truncate( result.query, 200 ) }` )
    .setColor( found ? COLOUR_REPORT : COLOUR_EMPTY )
    .setFooter( { text: `Stellar Cartography • Stardate ${ Utility.stardate() }` } )
    .setTimestamp();

  if ( canon != null ) {
    embed.addFields(
      { name: 'Designation', value: canon.name, inline: true },
      {
        name: 'Classification',
        value: canon.objectType == null ? 'Unclassified' : Stapi.describeType( canon.objectType ),
        inline: true
      }
    );

    if ( canon.location != null ) {
      embed.addFields( { name: 'Within', value: canon.location.name, inline: true } );
    }
  }

  if ( fix != null ) {
    embed.addFields(
      { name: 'Range', value: `${ fix.distanceLy.toFixed( 2 ) } ly`, inline: true },
      { name: 'Bearing', value: Msg.formatCourse( fix.bearing, fix.mark ), inline: true },
      {
        name: 'Catalogue fix',
        value: `${ fix.name }${ fix.spectralType == null ? '' : ` · ${ fix.spectralType }` }`,
        inline: true
      },
      {
        name: 'Coordinates',
        value: `\`${ Msg.formatCoordinates( fix.position ) }\``,
        inline: false
      }
    );
  }

  if ( result.note != null ) {
    embed.setDescription( result.note );
  }

  return embed;
}

function truncate ( text: string, max: number ): string {
  return text.length <= max ? text : `${ text.slice( 0, max - 1 ) }…`;
}

function help (): string {
  return 'Shipboard sensors, reported against wherever the ship currently is.\n'
    + '`/astrometrics report` — position, sector, quadrant, catalogued objects within '
    + `${ Astro.SENSOR_RANGE_LY } light years, and sector sensor readings.\n`
    + '`/astrometrics scan <object>` — identify an object and put a bearing and range on it '
    + 'where one can be had. Canon identity comes from STAPI, positions from the SIMBAD '
    + 'stellar catalogue.\n'
    + 'Readings are computed from the sector rather than measured, and the report says so. '
    + 'Set ASTROMETRICS_REMOTE=false to disable outbound catalogue lookups.';
}

export default {
  name: 'astrometrics',
  data,
  execute,
  help
} satisfies Command;
