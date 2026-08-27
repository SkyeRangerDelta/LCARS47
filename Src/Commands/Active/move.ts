// -- MOVE --
// Conn officer's console: lay in a course, or check where the ship is.
//
// Gating note: `status` is open to everyone and `abort` is not, so this command
// cannot use setDefaultMemberPermissions() - that would hide the whole command.
// The runtime checks below are the only gates.
//
// Replies are public, refusals included. Whether an order is accepted is not
// known until after the deferral, so a refusal cannot be made ephemeral without
// making departures ephemeral too - and a refused order read out in channel is
// both in character and a free audit trail.
//
// Anyone may order a course up to warp 9.0. Above that needs the Officer role,
// because the Technical Manual is clear that high warp stresses the vessel.
// While the ship is under way no new HEADING may be ordered - redirects wait
// until there is a map to navigate against. Velocity is different: /move speed
// changes how fast she covers the course already laid in, and is gated by the
// same warp tiers so it cannot be used to sidestep the officer check.

// Imports
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  EmbedBuilder
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { hasBridgeAuthority, isAdminUser } from '../../Subsystems/Utilities/AuthUtils.js';
import Ship from '../../Subsystems/Ship/Ship_Utilities.js';
import Msg from '../../Subsystems/Ship/Ship_Messages.js';
import {
  MAX_COURSE_DISTANCE_LY,
  WARP_DEFAULT,
  WARP_MAX_CRUISE,
  WARP_MAX_RATED,
  WARP_OPEN_MAX,
  checkCourseOrder,
  checkSpeedChange,
  transitDurationMs,
  type CourseRejection
} from '../../Subsystems/Ship/Ship_Navigation.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface.js';
import type {
  ResolvedPosition,
  TransitPlan,
  TransitProgress
} from '../../Subsystems/Auxiliary/Interfaces/ShipInterfaces.js';

// Command Data
const data = new SlashCommandBuilder()
  .setName( 'move' )
  .setDescription( 'Lay in a course, or report the ship\'s position.' );

// Subcommand: course
data.addSubcommand( s => s
  .setName( 'course' )
  .setDescription( 'Lay in a course and engage.' )
  .addNumberOption( o => o
    .setName( 'bearing' )
    .setDescription( 'Azimuth in degrees. 000 heads for the galactic core.' )
    .setMinValue( 0 )
    .setMaxValue( 359.9 )
    .setRequired( true )
  )
  .addNumberOption( o => o
    .setName( 'mark' )
    .setDescription( 'Elevation in degrees. 0 stays in the galactic plane, 90 is galactic north.' )
    .setMinValue( 0 )
    .setMaxValue( 359.9 )
    .setRequired( true )
  )
  .addNumberOption( o => o
    .setName( 'distance' )
    .setDescription( 'How far to travel, in light years.' )
    .setMinValue( 0.001 )
    .setMaxValue( MAX_COURSE_DISTANCE_LY )
    .setRequired( true )
  )
  .addNumberOption( o => o
    .setName( 'warp' )
    .setDescription( `Warp factor. Defaults to ${ WARP_DEFAULT } (normal cruise). Above 9 needs an officer.` )
    .setMinValue( 1 )
    .setMaxValue( WARP_MAX_RATED )
    .setRequired( false )
  )
);

// Subcommand: speed
data.addSubcommand( s => s
  .setName( 'speed' )
  .setDescription( 'Change velocity without changing the heading. Only while under way.' )
  .addNumberOption( o => o
    .setName( 'warp' )
    .setDescription( `New warp factor. Above ${ WARP_OPEN_MAX } needs an officer.` )
    .setMinValue( 1 )
    .setMaxValue( WARP_MAX_RATED )
    .setRequired( true )
  )
);

// Subcommand: status
data.addSubcommand( s => s
  .setName( 'status' )
  .setDescription( 'Report the ship\'s position, sector and any voyage under way.' )
);

// Subcommand: abort
data.addSubcommand( s => s
  .setName( 'abort' )
  .setDescription( 'All stop - drop out of warp where we are (admin only).' )
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

  const subCmd = int.options.getSubcommand();
  Utility.log( 'info', `[SHIP] Received ${ subCmd } from ${ int.user.tag }` );

  // Every branch reads Mongo and one of them fetches a guild member, so ack
  // first rather than gambling on Discord's three second deadline.
  await int.deferReply();

  switch ( subCmd ) {
    case 'course':
      return await handleCourse( LCARS47, int );

    case 'speed':
      return await handleSpeed( LCARS47, int );

    case 'status':
      return await handleStatus( LCARS47, int );

    case 'abort':
      return await handleAbort( LCARS47, int );

    default:
      return await int.editReply( { content: 'Unknown navigation order.' } );
  }
}

// -- Handlers --

async function handleStatus (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction
): Promise<unknown> {
  const doc = await Ship.getShipPosition( LCARS47.RDS_CONNECTION );
  LCARS47.SHIP_POSITION = doc;

  const resolved = Ship.resolveShipPosition( doc, Date.now() );

  return await int.editReply( { embeds: [buildStatusEmbed( resolved )] } );
}

async function handleCourse (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction
): Promise<unknown> {
  const now = Date.now();

  const doc = await Ship.getShipPosition( LCARS47.RDS_CONNECTION );
  LCARS47.SHIP_POSITION = doc;

  const resolved = Ship.resolveShipPosition( doc, now );

  // The resolver reports arrival the moment the ETA passes, so this releases
  // the lock without waiting for ShipMonitor's next sweep.
  if ( resolved.status === 'transit' ) {
    return await int.editReply( { embeds: [buildUnderwayRefusalEmbed( resolved )] } );
  }

  const bearing = int.options.getNumber( 'bearing', true );
  const mark = int.options.getNumber( 'mark', true );
  const distanceLy = int.options.getNumber( 'distance', true );
  const warpFactor = int.options.getNumber( 'warp' ) ?? WARP_DEFAULT;

  // Fetched rather than read off the interaction: an uncached invoker arrives
  // as a raw API member whose roles are bare IDs, and the Officer check needs
  // names.
  const member: GuildMember = await LCARS47.PLDYN.members.fetch( int.user.id );
  const isOfficer = hasBridgeAuthority( member, int.memberPermissions );

  const check = checkCourseOrder( { bearing, mark, distanceLy, warpFactor }, { isOfficer } );

  if ( !check.ok ) {
    Utility.log(
      'info',
      `[SHIP] Course refused for ${ int.user.tag }: ${ check.reason.code }`
    );

    return await int.editReply( {
      embeds: [buildRefusalEmbed( check.reason, distanceLy )]
    } );
  }

  const plan = Ship.planCourse( resolved.position, {
    bearing,
    mark,
    distanceLy,
    warpFactor,
    orderedBy: int.user.id
  }, now );

  LCARS47.SHIP_POSITION = await Ship.setCourse( LCARS47.RDS_CONNECTION, plan );

  Utility.log(
    'proc',
    `[SHIP] Under way: course ${ Msg.formatCourse( bearing, mark ) } at `
    + `${ Msg.formatWarp( warpFactor ) }, ${ distanceLy } ly, ordered by ${ int.user.tag }.`
  );

  return await int.editReply( {
    embeds: [buildDepartureEmbed( plan, resolved, int.user.displayName )]
  } );
}

async function handleSpeed (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction
): Promise<unknown> {
  const now = Date.now();

  const doc = await Ship.getShipPosition( LCARS47.RDS_CONNECTION );
  LCARS47.SHIP_POSITION = doc;

  const resolved = Ship.resolveShipPosition( doc, now );

  // Velocity only means something while there is a course to run it on.
  if ( resolved.status !== 'transit' || resolved.transit == null || doc.transit == null ) {
    return await int.editReply( { embeds: [buildRefusalEmbed( { code: 'not-under-way' }, 0 )] } );
  }

  const warpFactor = int.options.getNumber( 'warp', true );
  const previous = resolved.transit.warpFactor;

  const member: GuildMember = await LCARS47.PLDYN.members.fetch( int.user.id );
  const isOfficer = hasBridgeAuthority( member, int.memberPermissions );

  const check = checkSpeedChange( {
    remainingLy: resolved.transit.remainingLy,
    currentWarp: previous,
    warpFactor
  }, { isOfficer } );

  if ( !check.ok ) {
    Utility.log(
      'info',
      `[SHIP] Speed change refused for ${ int.user.tag }: ${ check.reason.code }`
    );

    return await int.editReply( {
      embeds: [buildRefusalEmbed( check.reason, resolved.transit.remainingLy )]
    } );
  }

  const plan = Ship.planSpeedChange(
    doc.transit,
    resolved.position,
    warpFactor,
    now,
    int.user.id
  );

  LCARS47.SHIP_POSITION = await Ship.setCourse( LCARS47.RDS_CONNECTION, plan );

  Utility.log(
    'proc',
    `[SHIP] Velocity changed from ${ Msg.formatWarp( previous ) } to `
    + `${ Msg.formatWarp( warpFactor ) } by ${ int.user.tag }.`
  );

  return await int.editReply( {
    embeds: [buildSpeedChangeEmbed( previous, plan, resolved.transit, int.user.displayName )]
  } );
}

async function handleAbort (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction
): Promise<unknown> {
  if ( !isAdminUser( int.user.id, int.memberPermissions ) ) {
    return await int.editReply( {
      content: 'All stop is an admiralty order. You do not have the authority.'
    } );
  }

  const now = Date.now();
  const doc = await Ship.getShipPosition( LCARS47.RDS_CONNECTION );
  const resolved = Ship.resolveShipPosition( doc, now );

  if ( resolved.status !== 'transit' ) {
    LCARS47.SHIP_POSITION = doc;
    return await int.editReply( { content: 'The ship is not under way. Nothing to stop.' } );
  }

  LCARS47.SHIP_POSITION = await Ship.settleAt(
    LCARS47.RDS_CONNECTION,
    resolved.position,
    int.user.id
  );

  Utility.log( 'warn', `[SHIP] All stop ordered by ${ int.user.tag }.` );

  const settled = Ship.resolveShipPosition( LCARS47.SHIP_POSITION, now );

  return await int.editReply( {
    content: 'All stop. Dropping out of warp.',
    embeds: [buildStatusEmbed( settled )]
  } );
}

// -- Embeds --
// Exported so the layout can be unit tested without a live interaction.

/** Where the ship is, and what she is doing. */
export function buildStatusEmbed ( resolved: ResolvedPosition ): EmbedBuilder {
  const underway = resolved.transit;

  const embed = new EmbedBuilder()
    .setTitle( `${ Msg.statusIcon( resolved.status ) } ${ Msg.statusLabel( resolved.status ) }` )
    .setColor( underway == null ? Msg.COLOUR_STATION : Msg.COLOUR_TRANSIT )
    .addFields(
      { name: 'Position', value: Msg.formatSector( resolved.sector ), inline: true },
      {
        name: 'Coordinates',
        value: `\`${ Msg.formatCoordinates( resolved.position ) }\``,
        inline: true
      },
      {
        name: 'Galactic centre',
        value: `${ resolved.distanceFromCoreLy.toFixed( 1 ) } ly`,
        inline: true
      },
      {
        name: 'Sol',
        value: `${ resolved.distanceFromSolLy.toFixed( 2 ) } ly`,
        inline: true
      },
      {
        name: 'Elevation',
        value: Msg.formatGalacticPlane( resolved.position.z ),
        inline: true
      }
    )
    .setFooter( { text: `Stellar Cartography • Stardate ${ Utility.stardate() }` } )
    .setTimestamp();

  if ( resolved.anchorage != null ) {
    embed.addFields( { name: 'Anchorage', value: resolved.anchorage, inline: true } );
  }

  if ( underway != null ) {
    embed.setDescription(
      `Course ${ Msg.formatCourse( underway.bearing, underway.mark ) } `
      + `at ${ Msg.formatWarp( underway.warpFactor ) }.`
    );

    embed.addFields(
      { name: 'Progress', value: Msg.progressBar( underway.progress ), inline: false },
      {
        name: 'Run',
        value: `${ underway.travelledLy.toFixed( 2 ) } of `
          + `${ underway.totalDistanceLy.toFixed( 2 ) } ly · `
          + `${ underway.remainingLy.toFixed( 2 ) } ly to run`,
        inline: false
      },
      {
        name: 'Arrival',
        value: `${ Msg.relativeTimestamp( underway.etaAt ) } · `
          + `${ Msg.absoluteTimestamp( underway.etaAt ) }`,
        inline: false
      }
    );
  }

  return embed;
}

/** Confirmation that a course has been laid in. */
export function buildDepartureEmbed (
  plan: TransitPlan,
  from: ResolvedPosition,
  orderedByName: string
): EmbedBuilder {
  const note = Msg.velocityNote( plan.warpFactor );

  const embed = new EmbedBuilder()
    .setTitle( '🚀 Course Laid In' )
    .setColor( Msg.COLOUR_TRANSIT )
    .setDescription( Msg.getDepartureMessage() )
    .addFields(
      {
        name: 'Course',
        value: Msg.formatCourse( plan.bearing, plan.mark ),
        inline: true
      },
      {
        name: 'Velocity',
        value: `${ Msg.formatWarp( plan.warpFactor ) } — ${ Msg.velocityLabel( plan.warpFactor ) }`,
        inline: true
      },
      {
        name: 'Distance',
        value: `${ plan.distanceLy.toFixed( 2 ) } ly`,
        inline: true
      },
      {
        name: 'Departing',
        value: Msg.formatSector( from.sector ),
        inline: true
      },
      {
        name: 'Duration',
        value: Msg.formatDuration( plan.etaAt.getTime() - plan.departedAt.getTime() ),
        inline: true
      },
      {
        name: 'Arrival',
        value: `${ Msg.relativeTimestamp( plan.etaAt ) } · ${ Msg.absoluteTimestamp( plan.etaAt ) }`,
        inline: false
      }
    )
    .setFooter( { text: `Ordered by ${ orderedByName } • Stardate ${ Utility.stardate() }` } )
    .setTimestamp();

  if ( note != null ) {
    embed.addFields( { name: 'Engineering', value: note, inline: false } );
  }

  return embed;
}

/** Confirmation that velocity has changed part way through a voyage. */
export function buildSpeedChangeEmbed (
  previousWarp: number,
  plan: TransitPlan,
  before: TransitProgress,
  orderedByName: string
): EmbedBuilder {
  const note = Msg.velocityNote( plan.warpFactor );
  const faster = plan.warpFactor > previousWarp;

  const embed = new EmbedBuilder()
    .setTitle( faster ? '⏩ Ahead Faster' : '⏪ Reducing Speed' )
    .setColor( Msg.COLOUR_TRANSIT )
    .setDescription( Msg.getSpeedChangeMessage( previousWarp, plan.warpFactor ) )
    .addFields(
      {
        name: 'Velocity',
        value: `${ Msg.formatWarp( previousWarp ) } → **${ Msg.formatWarp( plan.warpFactor ) }**`
          + ` — ${ Msg.velocityLabel( plan.warpFactor ) }`,
        inline: true
      },
      {
        name: 'Course',
        value: `${ Msg.formatCourse( plan.bearing, plan.mark ) } (unchanged)`,
        inline: true
      },
      {
        name: 'Remaining',
        value: `${ plan.distanceLy.toFixed( 2 ) } ly`,
        inline: true
      },
      {
        name: 'Progress',
        value: Msg.progressBar( before.progress ),
        inline: false
      },
      {
        name: 'Was arriving',
        value: Msg.relativeTimestamp( before.etaAt ),
        inline: true
      },
      {
        name: 'Now arriving',
        value: `${ Msg.relativeTimestamp( plan.etaAt ) } · ${ Msg.absoluteTimestamp( plan.etaAt ) }`,
        inline: true
      },
      {
        name: faster ? 'Time saved' : 'Time added',
        value: Msg.formatDuration(
          Math.abs( plan.etaAt.getTime() - before.etaAt.getTime() )
        ),
        inline: true
      }
    )
    .setFooter( { text: `Ordered by ${ orderedByName } • Stardate ${ Utility.stardate() }` } )
    .setTimestamp();

  if ( note != null ) {
    embed.addFields( { name: 'Engineering', value: note, inline: false } );
  }

  return embed;
}

/** The ship is already under way; no course may be ordered. */
export function buildUnderwayRefusalEmbed ( resolved: ResolvedPosition ): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle( '🚫 Course Change Refused' )
    .setColor( Msg.COLOUR_REFUSED )
    .setDescription( Msg.getUnderwayRefusal() );

  if ( resolved.transit != null ) {
    embed.addFields(
      { name: 'Progress', value: Msg.progressBar( resolved.transit.progress ), inline: false },
      {
        name: 'Arrival',
        value: Msg.relativeTimestamp( resolved.transit.etaAt ),
        inline: true
      }
    );
  }

  return embed.setFooter( { text: `Stellar Cartography • Stardate ${ Utility.stardate() }` } );
}

/** Why an order was not accepted. */
export function buildRefusalEmbed (
  reason: CourseRejection,
  distanceLy: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle( '🚫 Order Refused' )
    .setColor( Msg.COLOUR_REFUSED )
    .setFooter( { text: `Stellar Cartography • Stardate ${ Utility.stardate() }` } );

  switch ( reason.code ) {
    case 'invalid-bearing':
      return embed.setDescription( 'Bearing must be between 000 and 359.9 degrees.' );

    case 'invalid-mark':
      return embed.setDescription( 'Mark must be between 0 and 359.9 degrees.' );

    case 'invalid-distance':
      return embed.setDescription(
        `Distance must be greater than zero and no more than ${ reason.maxLy } light years.`
      );

    case 'warp-out-of-range':
      return embed.setDescription(
        `The Galaxy class is rated to warp ${ reason.maxWarp }. `
        + 'The engines will not answer beyond that, whoever is asking.'
      );

    case 'high-warp-restricted':
      return embed.setDescription(
        `Velocities above warp ${ reason.threshold } stress the spaceframe and require `
        + 'bridge officer authorisation. Order refused.'
      );

    case 'same-velocity':
      return embed.setDescription(
        `We are already at ${ Msg.formatWarp( reason.warpFactor ) }.`
      );

    case 'not-under-way':
      return embed.setDescription(
        'The ship is not under way. Lay in a course with `/move course` first — '
        + 'velocity is set as part of the order.'
      );

    case 'high-warp-duration': {
      const alternativeMs = transitDurationMs( distanceLy, reason.alternativeWarp );

      return embed
        .setDescription(
          `Sustained velocity above warp ${ WARP_MAX_CRUISE } is limited to twelve hours. `
          + 'That course cannot be run at this factor.'
        )
        .addFields(
          {
            name: 'Maximum run at this velocity',
            value: `${ reason.limitLy.toFixed( 2 ) } ly`,
            inline: true
          },
          {
            name: `At warp ${ reason.alternativeWarp }`,
            value: Msg.formatDuration( alternativeMs ),
            inline: true
          }
        );
    }
  }
}

function help (): string {
  return 'Navigation control for the ship.\n'
    + '`/move status` — position, sector and any voyage under way. Open to all.\n'
    + '`/move course bearing mark distance [warp]` — lay in a course and engage. '
    + `Bearing 000 heads for the galactic core; mark 90 is galactic north. Warp defaults to ${ WARP_DEFAULT }, `
    + `the normal cruising speed. Above warp 9 needs the Officer role, and warp ${ WARP_MAX_RATED } is the ceiling.\n`
    + '`/move abort` — all stop, admin only.\n'
    + 'No course may be ordered while the ship is already under way.';
}

export default {
  name: 'move',
  data,
  execute,
  help
} satisfies Command;
