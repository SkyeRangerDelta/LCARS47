// -- MESSAGE REACTION ADD EVENT --
// Feeds the REACTIONS counter behind /profile. Adds only - see the note in
// Stats_Utilities on why removals do not decrement.

// Imports
import { type MessageReaction, type PartialMessageReaction, type PartialUser, type User } from 'discord.js';
import Utility from '../Subsystems/Utilities/SysUtils.js';
import Stats from '../Subsystems/Stats/Stats_Utilities.js';
import { type LCARSClient } from '../Subsystems/Auxiliary/LCARSClient.js';

// Exports
export default {
  name: 'messageReactionAdd',
  execute: async (
    LCARS47: LCARSClient,
    reaction: MessageReaction | PartialMessageReaction,
    reactor: User | PartialUser
  ) => {
    if ( reactor.bot ) return;

    // Partials are enabled for reactions, so `reactor.username` can be absent
    // on anything that predates the session. Fetch before reading it, and give
    // up quietly if the user is gone - a deleted account is not an error worth
    // surfacing.
    let user: User;
    try {
      user = reactor.partial ? await reactor.fetch() : reactor;
    }
    catch ( fetchErr ) {
      Utility.log( 'warn', `[EVENT] [REACT-ADD] Could not resolve reactor: ${ ( fetchErr as Error ).message }` );
      return;
    }

    if ( user.bot ) return;

    // Guild reactions only, matching the messageCreate rule.
    if ( reaction.message.guildId == null ) return;

    Utility.log( 'proc', `[EVENT] [REACT-ADD] ${ user.username } reacted ${ reaction.emoji.name ?? '?' }` );

    Stats.recordActivity( LCARS47.RDS_CONNECTION, user.id, user.username, 'REACTIONS' );
  }
};
