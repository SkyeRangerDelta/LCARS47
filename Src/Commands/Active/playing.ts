// -- PLAYING --
// Displays details about the currently-playing track, with cover art
// attached when the active source provides a thumbnail URL.

import { SlashCommandBuilder } from '@discordjs/builders';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import {
  AttachmentBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type InteractionResponse,
  MessageFlags
} from 'discord.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { type Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import { convertSecondsToHMS } from '../../Subsystems/Utilities/MediaUtils';
import { sourceAndDuration } from '../../Subsystems/MediaPlayer/TrackFormat.js';
import { type Track } from '../../Subsystems/MediaPlayer/Interfaces/Track.js';

const FETCH_TIMEOUT_MS = 4000;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2MB ceiling; real images are ~20-100KB

const data = new SlashCommandBuilder()
  .setName( 'playing' )
  .setDescription( 'Displays details about the currently playing song.' );

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  Utility.log( 'info', '[MEDIA-PLAYER] Received a song detail request.' );

  let member: GuildMember;
  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch {
    return await int.reply( {
      content: 'No data could be found on your user. Process terminated.',
      flags: MessageFlags.Ephemeral
    } );
  }

  if ( member.voice?.channel == null ) {
    return await int.reply( {
      content: 'User must be attached to a valid voice channel.',
      flags: MessageFlags.Ephemeral
    } );
  }

  const track = LCARS47.MEDIA_PLAYER.getNowPlaying();
  if ( track == null ) {
    return await int.reply( { content: 'No media in queue.' } );
  }

  const currentPlaytime = Math.floor( ( Date.now() - track.playStart ) / 1000 );
  const titleLine = track.source === 'youtube'
    ? `__[${ track.title }](<${ track.url }>)__ ${ sourceAndDuration( track ) }`
    : `__${ track.title }__ ${ sourceAndDuration( track ) }`;

  const albumArtistLine = track.albumArtist != null
    ? `Album Artist: *${ track.albumArtist }*\n`
    : '';

  const content =
    `${ titleLine }\n` +
    `From: *${ track.channelOrAlbumLabel }*\n` +
    `${ albumArtistLine }` +
    `Playtime: ${ convertSecondsToHMS( currentPlaytime ) } / ${ track.durationFriendly }\n` +
    `Queued by: ${ track.requestedBy.displayName }`;

  const attachment = await fetchCoverAttachment( track );
  if ( attachment != null ) {
    return await int.reply( { content, files: [attachment] } );
  }
  return await int.reply( { content } );
}

async function fetchCoverAttachment( track: Track ): Promise<AttachmentBuilder | null> {
  if ( track.thumbnailUrl == null || track.thumbnailUrl === '' ) return null;

  const controller = new AbortController();
  const timer = setTimeout( () => controller.abort(), FETCH_TIMEOUT_MS );
  try {
    const res = await fetch( track.thumbnailUrl, { signal: controller.signal } );
    if ( !res.ok ) {
      Utility.log( 'warn', `[MEDIA-PLAYER] Cover fetch HTTP ${ res.status } for ${ track.thumbnailUrl }` );
      return null;
    }
    const buf = Buffer.from( await res.arrayBuffer() );
    if ( buf.byteLength > MAX_ATTACHMENT_BYTES ) {
      Utility.log( 'warn', `[MEDIA-PLAYER] Cover image too large (${ buf.byteLength } bytes); skipping.` );
      return null;
    }
    const ext = res.headers.get( 'content-type' )?.includes( 'png' ) === true ? 'png' : 'jpg';
    return new AttachmentBuilder( buf, { name: `cover.${ ext }` } );
  }
  catch ( err ) {
    Utility.log( 'warn', `[MEDIA-PLAYER] Cover fetch failed: ${ String( err ) }` );
    return null;
  }
  finally {
    clearTimeout( timer );
  }
}

function help (): string {
  return 'Displays details about the currently playing song.';
}

export default {
  name: 'Playing',
  data,
  execute,
  help
} satisfies Command;
