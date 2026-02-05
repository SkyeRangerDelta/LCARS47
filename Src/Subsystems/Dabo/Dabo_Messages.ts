// ---- Dabo Messages ----
// DS9-themed flavor text for the Dabo game

import type { DaboResultType } from '../Auxiliary/Interfaces/DaboInterfaces.js';

// Messages for jackpots (three Odo)
const JACKPOT_MESSAGES: string[] = [
  'DABO! The Grand Nagus would be proud!',
  'DABO! The entire bar erupts in celebration!',
  'DABO! Even Odo would crack a smile at this!',
  'DABO! Your lobes are positively tingling!',
  'DABO! Rule of Acquisition #9: Opportunity plus instinct equals profit!',
  'DABO! The Blessed Exchequer smiles upon you!',
  'DABO! A Ferengi couldn\'t have done it better!',
  'DABO! Morn raises his glass in your honor!'
];

// Messages for triple Quark
const TRIPLE_QUARK_MESSAGES: string[] = [
  'Triple Quark! "I\'m not just a pretty face!" -Quark',
  'Triple Quark! The barkeep himself blesses your spin!',
  'Triple Quark! "When it comes to profit, I have no conscience." -Quark',
  'Triple Quark! Quark gives you a knowing wink from behind the bar.',
  'Triple Quark! "Every once in a while, declare peace. It confuses the hell out of your enemies." -Quark'
];

// Messages for regular triples
const TRIPLE_MESSAGES: string[] = [
  'Triple match! Your lobes must be tingling!',
  'Three of a kind! Not bad for a hew-mon!',
  'Triple! The Dabo girls cheer your name!',
  'Three in a row! Rule of Acquisition #62: The riskier the road, the greater the profit.',
  'Triple match! Quark narrows his eyes suspiciously.'
];

// Messages for pairs
const PAIR_MESSAGES: string[] = [
  'A pair! Small profit is still profit.',
  'Two matching! "Never begin a negotiation on an empty stomach." -Quark',
  'Pair! The house pays out... reluctantly.',
  'Two of a kind! Your latinum stash grows.',
  'A pair! Rule of Acquisition #95: Expand or die.'
];

// Messages for losses
const LOSS_MESSAGES: string[] = [
  'No match. The house always wins... eventually. -Quark',
  'Nothing this time. Better luck next spin!',
  'No match. "It\'s not my fault your species doesn\'t have the lobes for business." -Quark',
  'A loss. Morn shrugs sympathetically.',
  'No luck. Rule of Acquisition #3: Never spend more for an acquisition than you have to.',
  'Nothing. The Dabo wheel spins on...',
  'No match. "You don\'t understand. Ferengi workers don\'t want to stop the exploitation. We want to find a way to become the exploiters." -Quark',
  'A loss. Even the best Ferengi have off days.'
];

// Messages for free play mode
const FREE_PLAY_MESSAGES: string[] = [
  '(Free Play - No GPL wagered)',
  '(Practice Mode - For entertainment only)',
  '(Free Spin - Quark frowns at the lack of profit)',
  '(No Bet - "This is bad for business!" -Quark)'
];

// Messages for insufficient funds
const INSUFFICIENT_FUNDS_MESSAGES: string[] = [
  '"No money, no Dabo!" -Quark',
  'Your latinum reserves are insufficient for this wager.',
  'Rule of Acquisition #1: Once you have their money, you never give it back. (But first you need the money!)',
  'The Dabo wheel doesn\'t spin on promises. Lower your bet!'
];

// Welcome messages for new players
const NEW_PLAYER_MESSAGES: string[] = [
  'Welcome to Quark\'s! Here\'s 1,000 GPL to get you started. Don\'t spend it all in one place!',
  'A new player! The Grand Nagus grants you 1,000 Gold-Pressed Latinum. May your profits be large!',
  'Welcome, newcomer! Rule of Acquisition #74: Knowledge equals profit. Here\'s 1,000 GPL to learn with.'
];

// Get a random message from an array
function getRandomMessage ( messages: string[] ): string {
  return messages[Math.floor( Math.random() * messages.length )];
}

// Get appropriate message based on result type
function getResultMessage ( resultType: DaboResultType ): string {
  switch ( resultType ) {
    case 'jackpot':
      return getRandomMessage( JACKPOT_MESSAGES );
    case 'triple_quark':
      return getRandomMessage( TRIPLE_QUARK_MESSAGES );
    case 'triple':
      return getRandomMessage( TRIPLE_MESSAGES );
    case 'pair':
      return getRandomMessage( PAIR_MESSAGES );
    case 'loss':
      return getRandomMessage( LOSS_MESSAGES );
  }
}

// Get a free play mode message
function getFreePlaysMessage (): string {
  return getRandomMessage( FREE_PLAY_MESSAGES );
}

// Get an insufficient funds message
function getInsufficientFundsMessage (): string {
  return getRandomMessage( INSUFFICIENT_FUNDS_MESSAGES );
}

// Get a new player welcome message
function getNewPlayerMessage (): string {
  return getRandomMessage( NEW_PLAYER_MESSAGES );
}

// Get streak message
function getStreakMessage ( streak: number ): string {
  if ( streak >= 5 ) {
    return `🔥 ${streak} win streak! Your lobes are on fire!`;
  }
  if ( streak >= 3 ) {
    return `✨ ${streak} wins in a row!`;
  }
  if ( streak <= -5 ) {
    return `💸 ${Math.abs( streak )} loss streak... Quark is pleased.`;
  }
  if ( streak <= -3 ) {
    return `📉 ${Math.abs( streak )} losses in a row.`;
  }
  return '';
}

// Exports
export default {
  getResultMessage,
  getFreePlaysMessage,
  getInsufficientFundsMessage,
  getNewPlayerMessage,
  getStreakMessage,
  JACKPOT_MESSAGES,
  LOSS_MESSAGES
};
