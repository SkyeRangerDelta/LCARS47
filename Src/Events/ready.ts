// -- READY EVENT --

// Imports
import Utility from '../Subsystems/Utilities/SysUtils.js';
import { type LCARSClient } from '../Subsystems/Auxiliary/LCARSClient.js';
import RDS from '../Subsystems/RemoteDS/RDS_Utilities.js';
import Ship from '../Subsystems/Ship/Ship_Utilities.js';
import Beszel from '../Subsystems/RemoteDS/Beszel_Connect.js';
import BeszelUtils from '../Subsystems/RemoteDS/Beszel_Utilities.js';
import { type StatusInterface } from '../Subsystems/Auxiliary/Interfaces/StatusInterface.js';
import { getEnv, isFeatureEnabled } from '../Subsystems/Utilities/EnvUtils.js';
import { MediaPlayerService } from '../Subsystems/MediaPlayer/MediaPlayerService.js';
import { JellyfinClient } from '../Subsystems/Jellyfin/JellyfinClient.js';
import { AMPClient } from '../Subsystems/AMP/AMPClient.js';
import { BeszelMonitor } from '../Subsystems/Monitors/BeszelMonitor.js';
import { AMPMonitor } from '../Subsystems/Monitors/AMPMonitor.js';
import { ShipMonitor } from '../Subsystems/Monitors/ShipMonitor.js';

import { ActivityType, type TextChannel } from 'discord.js';

const env = getEnv();

// Exports
export default {
  name: 'clientReady',
  once: true,
  execute: async ( LCARS47: LCARSClient, args?: string[] ) => {

    if ( args != undefined && args?.length > 0 ) {
      Utility.log( 'info', '[READY] Received arguments for startup.' );
    }

    LCARS47.PLDYN = await LCARS47.guilds.fetch( env.PLDYNID );
    LCARS47.MEMBER = await LCARS47.PLDYN.members.fetch( env.LCARSID );
    LCARS47.MEDIA_PLAYER = new MediaPlayerService( LCARS47, {
      guildId: env.PLDYNID,
      reportChannelId: env.MEDIALOG,
      pathMap: env.JELLYFIN_PATH_MAP
    } );
    LCARS47.CLIENT_STATS = {
      CLIENT_MEM_USAGE: 0,
      CMD_QUERIES: 0,
      CMD_QUERIES_FAILED: 0,
      SYSTEM_LATENCY: 0,
      MEDIA_PLAYER_DATA: {},
      MEDIA_PLAYER_STATE: false,
      QUERIES: 0,
      SESSION: 0,
      SESSION_UPTIME: 0,
      STARTUP_TIME: '',
      STARTUP_UTC: 0,
      VERSION: '',
      STATE: false
    } satisfies StatusInterface;

    Utility.log( 'proc', '[CLIENT] IM ALIVE!' );
    Utility.log( 'proc', `[CLIENT] Current Stardate: ${Utility.stardate()} - Shipboard time: ${ Utility.shipboardTime() }` );

    const version = Utility.getVersion();

    LCARS47.user?.setPresence( {
      activities: [{ name: `for stuff | ${ version }`, type: ActivityType.Watching }],
      status: 'online'
    } );

    if ( process.argv.includes( '--heartbeat' ) ) {
      Utility.log( 'proc', 'Heartbeat done.' );
      return process.exit( 0 );
    }

    LCARS47.RDS_CONNECTION = await RDS.rds_connect();

    // Load-or-seed the ship's position. Must sit after the --heartbeat guard
    // above: that path exits before RDS_CONNECTION exists.
    LCARS47.SHIP_POSITION = await Ship.getShipPosition( LCARS47.RDS_CONNECTION );
    Utility.log(
      'proc',
      `[SHIP] Position restored: ${ LCARS47.SHIP_POSITION.status } in Sector `
      + `${ Ship.resolveShipPosition( LCARS47.SHIP_POSITION, Date.now() ).sector.designation }.`
    );

    // Announces arrivals and closes out finished voyages. Not required for
    // correctness - every reader derives position from the transit plan's
    // timestamps - so a failure here costs the announcement and nothing else.
    try {
      const shipMonitor = new ShipMonitor( {
        client: LCARS47,
        connection: LCARS47.RDS_CONNECTION,
        alertChannelId: env.SHIP_LOG_CHANNEL ?? env.ENGINEERING
      } );
      await shipMonitor.start();
      LCARS47.SHIP_MONITOR = shipMonitor;
    }
    catch ( shipErr ) {
      Utility.log( 'warn', `[SHIP-MON] Init failed: ${ ( shipErr as Error ).message }` );
      Utility.log( 'warn', '[SHIP-MON] Arrivals will not be announced; positions remain correct.' );
    }

    // Initialize Beszel client if feature is enabled
    if ( isFeatureEnabled( 'jellyfin' ) ) {
      try {
        const jellyfin = new JellyfinClient( {
          host: env.JELLYFIN_HOST!,
          port: env.JELLYFIN_PORT,
          apiKey: env.JELLYFIN_KEY,
          username: env.JELLYFIN_USER!,
          password: env.JELLYFIN_PASS!,
          clientVersion: Utility.getVersion()
        } );
        jellyfin.connect();
        await jellyfin.authenticate();
        LCARS47.MEDIA_PLAYER.attachJellyfin( jellyfin );
        Utility.log( 'proc', '[JELLYFIN] Provider registered with MediaPlayer.' );
      }
      catch ( jellyErr ) {
        Utility.log( 'warn', `[JELLYFIN] Init failed: ${ ( jellyErr as Error ).message }` );
        Utility.log( 'warn', '[JELLYFIN] Falling back to YouTube-only playback.' );
      }
    }
    else {
      Utility.log( 'info', '[JELLYFIN] Feature not enabled - skipping initialization.' );
    }

    if ( isFeatureEnabled( 'beszel' ) ) {
      try {
        LCARS47.BESZEL_CLIENT = await Beszel.beszel_connect();

        // Fetch initial systems list
        LCARS47.BESZEL_SYSTEMS = await BeszelUtils.beszel_getSystems(LCARS47.BESZEL_CLIENT);
        Utility.log('proc', `[BESZEL] Loaded ${LCARS47.BESZEL_SYSTEMS.length} systems for autocomplete cache`);

        // Push half of the integration: alert on host state changes rather
        // than waiting to be asked. Also keeps BESZEL_SYSTEMS fresh, which
        // /server-status autocomplete otherwise only ever saw at boot.
        const monitor = new BeszelMonitor( {
          client: LCARS47,
          pb: LCARS47.BESZEL_CLIENT,
          alertChannelId: env.BESZEL_ALERT_CHANNEL ?? env.ENGINEERING
        } );
        await monitor.start();
        LCARS47.BESZEL_MONITOR = monitor;
      } catch (beszelErr) {
        Utility.log('warn', `[BESZEL] Failed to initialize Beszel client: ${(beszelErr as Error).message}`);
        Utility.log('warn', '[BESZEL] Server monitoring features will be unavailable.');
        LCARS47.BESZEL_SYSTEMS = []; // Empty array as fallback
      }
    }
    else {
      Utility.log( 'info', '[BESZEL] Feature not enabled - skipping initialization.' );
      LCARS47.BESZEL_SYSTEMS = [];
    }

    if ( isFeatureEnabled( 'amp' ) ) {
      try {
        const amp = new AMPClient( {
          baseUrl: env.AMP_URL!,
          username: env.AMP_USERNAME!,
          password: env.AMP_PASSWORD!
        } );

        await amp.authenticate();

        // Warm the cache the /amp autocomplete reads from — that path cannot
        // afford a login or a cold fetch inside Discord's 3s deadline.
        const instances = await amp.listInstances( { force: true } );

        LCARS47.AMP_CLIENT = amp;
        Utility.log( 'proc', `[AMP] Connected to ${ amp.baseUrl } - ${ instances.length } instances cached.` );

        // Watches running game servers for crashes. Its sweep doubles as the
        // keep-alive for the per-instance proxy sessions, so nothing else has
        // to hold those open.
        const ampMonitor = new AMPMonitor( {
          client: LCARS47,
          amp,
          alertChannelId: env.AMP_ALERT_CHANNEL ?? env.ENGINEERING
        } );
        await ampMonitor.start();
        LCARS47.AMP_MONITOR = ampMonitor;
      }
      catch ( ampErr ) {
        Utility.log( 'warn', `[AMP] Init failed: ${ ( ampErr as Error ).message }` );
        Utility.log( 'warn', '[AMP] Game server control will be unavailable.' );
      }
    }
    else {
      Utility.log( 'info', '[AMP] Feature not enabled - skipping initialization.' );
    }

    Utility.log( 'info', '[CLIENT] Getting old stats page.' );
    const oldBotData = await RDS.rds_getStatusFull( LCARS47.RDS_CONNECTION );

    Utility.log( 'info', '[CLIENT] Sending updated stats page.' );
    const startTime = Utility.flexTime();
    const startUTC = Date.now();
    const updateData = {
      $set: {
        STATE: true,
        VERSION: version,
        STARTUP_TIME: startTime,
        STARTUP_UTC: startUTC
      },
      $inc: {
        SESSION: 1,
        QUERIES: 1
      }
    };

    const lastStartTime: string = Utility.formatMSDiff( oldBotData.STARTUP_UTC ).toHuman( { unitDisplay: 'long' } );
    Utility.log( 'info', '[CLIENT] Time since last boot sequence:\n' + lastStartTime );

    const res = await RDS.rds_update( LCARS47.RDS_CONNECTION, 'rds_status', { id: 1 }, updateData );
    if ( !res ) {
      throw new Error( 'RDS status update failed!' );
    }

    const engineeringLog = await LCARS47.PLDYN.channels.fetch( env.ENGINEERING ) as TextChannel;
    await engineeringLog.send( `LCARS ${version} is ONLINE.` );
  }
};
