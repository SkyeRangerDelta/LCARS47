// -- PLAY --
// Thin handler that delegates to MediaPlayerService.

import {
  type AutocompleteInteraction,
  type CacheType,
  type ChatInputCommandInteraction,
  type GuildCacheMessage,
  type GuildMember,
  type VoiceChannel
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';
import { type Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import { sourceAndDuration, sourceLabel } from '../../Subsystems/MediaPlayer/TrackFormat.js';

const data = new SlashCommandBuilder()
  .setName( 'play' )
  .setDescription( 'Fires up an audio stream in your current VC.' );

data.addStringOption( o => o
  .setName( 'video-query' )
  .setDescription( 'The link or search to play from.' )
  .setRequired( true )
);

data.addBooleanOption( o => o
  .setName( 'album' )
  .setDescription( 'Queue the whole album / playlist when the query matches a container.' )
  .setRequired( false )
);

async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<GuildCacheMessage<CacheType> | void> {
  if ( int.isAutocomplete() ) return await int.respond([
    { name: 'This command does not support autocomplete.', value: 'none' }
  ]);

  await int.deferReply();

  let member: GuildMember;
  try {
    member = await LCARS47.PLDYN.members.fetch( int.user.id );
  }
  catch ( noUserErr ) {
    Utility.log( 'warn', `[MEDIA-PLAYER] No user lookup: ${ String( noUserErr ) }` );
    return await int.editReply( 'No user could be found!' );
  }

  if ( member.voice?.channel == null ) {
    return await int.editReply( 'You need to be in a voice channel first!' );
  }
  const voiceChannel = member.voice.channel as VoiceChannel;
  Utility.log( 'info', `[MEDIA-PLAYER] /play request for channel: ${ voiceChannel.name }` );

  const query = int.options.getString( 'video-query' ) ?? '';
  const expandContainers = int.options.getBoolean( 'album' ) === true;
  const result = await LCARS47.MEDIA_PLAYER.enqueue(
    query,
    voiceChannel,
    member,
    { expandContainers }
  );

  if ( !result.ok ) {
    if ( result.reason === 'no-results' ) {
      return await int.editReply( 'No search results found!' );
    }
    return await int.editReply( 'Invalid video data received!' );
  }

  Utility.log(
    'info',
    `[MEDIA-PLAYER] Queued ${ result.queuedCount } track(s); head: ${ result.track.title } (${ result.track.source })`
  );

  const reply = result.queuedCount > 1
    ? `Queued **${ result.track.title }** + ${ result.queuedCount - 1 } more (${ sourceLabel( result.track.source ) })`
    : `Queued **${ result.track.title }** ${ sourceAndDuration( result.track ) }`;

  return await int.editReply( reply );
}

function help (): string {
  return 'Fires up an audio stream in your current VC.';
}

export default {
  name: 'Play',
  data,
  execute,
  help
} satisfies Command;
