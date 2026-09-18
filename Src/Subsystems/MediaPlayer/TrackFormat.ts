// -- Track formatting helpers --
// Shared between the play / queue / playing commands so source labelling
// stays consistent.

import { type ProviderId, type Track } from './Interfaces/Track.js';

const SOURCE_LABEL: Record<ProviderId, string> = {
  youtube: 'YouTube',
  jellyfin: 'Jellyfin',
  local: 'Local'
};

export function sourceLabel( source: ProviderId ): string {
  return SOURCE_LABEL[source];
}

/** "(YouTube · 3:24)" — used in /play and /playing replies. */
export function sourceAndDuration( track: Track ): string {
  return `(${ sourceLabel( track.source ) } · ${ track.durationFriendly })`;
}

/** Queue-line formatting. YouTube tracks render as a markdown link;
 *  Jellyfin / local tracks prefix with the source label since their `url`
 *  is a synthetic identifier with no useful target. */
export function queueLine( track: Track ): string {
  if ( track.source === 'youtube' ) {
    return `**[${ track.title }](${ track.url })** — *${ track.channelOrAlbumLabel }* (${ track.durationFriendly })`;
  }
  return `**[${ sourceLabel( track.source ) }] ${ track.title }** — *${ track.channelOrAlbumLabel }* (${ track.durationFriendly })`;
}
