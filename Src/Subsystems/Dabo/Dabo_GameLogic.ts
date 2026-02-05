// ---- Dabo Game Logic ----

// Imports
import type {
  DaboSymbol,
  DaboSymbolConfig,
  DaboSpinResult,
  DaboResultType
} from '../Auxiliary/Interfaces/DaboInterfaces.js';

// Symbol configuration with weights
// Higher weight = more common
const SYMBOLS: DaboSymbolConfig[] = [
  { name: 'latinum', emoji: '🪙', weight: 25 },    // Common - Gold-Pressed Latinum bar
  { name: 'ferengi', emoji: '👂', weight: 25 },    // Common - Ferengi Alliance (ears/lobes)
  { name: 'bar', emoji: '🍺', weight: 25 },        // Common - Quark's Bar
  { name: 'star', emoji: '⭐', weight: 15 },       // Uncommon - Starfleet delta
  { name: 'quark', emoji: '🤵', weight: 7 },       // Rare - Quark himself
  { name: 'odo', emoji: '🔶', weight: 3 }          // Very Rare - Odo (shapeshifter)
];

// Payout multipliers
const PAYOUTS: Record<DaboResultType, number> = {
  jackpot: 25,       // Three Odo
  triple_quark: 10,  // Three Quark
  triple: 5,         // Any other three matching
  pair: 2,           // Two matching
  loss: 0            // No match
};

// Calculate total weight for probability distribution
const TOTAL_WEIGHT = SYMBOLS.reduce( ( sum, s ) => sum + s.weight, 0 );

// Get a random symbol based on weighted probability
function getRandomSymbol (): DaboSymbol {
  const roll = Math.random() * TOTAL_WEIGHT;
  let cumulative = 0;

  for ( const symbol of SYMBOLS ) {
    cumulative += symbol.weight;
    if ( roll < cumulative ) {
      return symbol.name;
    }
  }

  // Fallback (should never reach)
  return 'latinum';
}

// Spin the wheel and get three symbols
function spinReels (): [DaboSymbol, DaboSymbol, DaboSymbol] {
  return [
    getRandomSymbol(),
    getRandomSymbol(),
    getRandomSymbol()
  ];
}

// Determine result type from reels
function determineResultType ( reels: [DaboSymbol, DaboSymbol, DaboSymbol] ): DaboResultType {
  const [a, b, c] = reels;

  // Check for three of a kind
  if ( a === b && b === c ) {
    if ( a === 'odo' ) {
      return 'jackpot';
    }
    if ( a === 'quark' ) {
      return 'triple_quark';
    }
    return 'triple';
  }

  // Check for pair
  if ( a === b || b === c || a === c ) {
    return 'pair';
  }

  // No match
  return 'loss';
}

// Main spin function
function spin ( bet: number ): DaboSpinResult {
  const reels = spinReels();
  const resultType = determineResultType( reels );
  const multiplier = PAYOUTS[resultType];
  const payout = bet * multiplier;
  const isWin = multiplier > 0;

  return {
    reels,
    resultType,
    multiplier,
    payout,
    isWin
  };
}

// Get emoji representation for a symbol
function getSymbolEmoji ( symbol: DaboSymbol ): string {
  const config = SYMBOLS.find( s => s.name === symbol );
  return config?.emoji ?? '❓';
}

// Get display string for reels (with emojis)
function getReelsDisplay ( reels: [DaboSymbol, DaboSymbol, DaboSymbol] ): string {
  return `[ ${getSymbolEmoji( reels[0] )} | ${getSymbolEmoji( reels[1] )} | ${getSymbolEmoji( reels[2] )} ]`;
}

// Get friendly name for result type
function getResultTypeName ( resultType: DaboResultType ): string {
  switch ( resultType ) {
    case 'jackpot':
      return '🎰 DABO! JACKPOT! 🎰';
    case 'triple_quark':
      return '🤵 TRIPLE QUARK! 🤵';
    case 'triple':
      return '✨ Triple Match! ✨';
    case 'pair':
      return '👍 Pair';
    case 'loss':
      return '💨 No Match';
  }
}

// Calculate theoretical odds (for display purposes)
function getOdds (): Record<DaboResultType, string> {
  // Probability of specific symbol = weight / total
  const probs: Record<DaboSymbol, number> = {} as Record<DaboSymbol, number>;
  for ( const s of SYMBOLS ) {
    probs[s.name] = s.weight / TOTAL_WEIGHT;
  }

  // Three of a kind for specific symbol = p^3
  const jackpotOdds = Math.pow( probs['odo'], 3 );
  const tripleQuarkOdds = Math.pow( probs['quark'], 3 );

  // Any triple (sum of all p^3)
  let anyTripleOdds = 0;
  for ( const s of SYMBOLS ) {
    if ( s.name !== 'odo' && s.name !== 'quark' ) {
      anyTripleOdds += Math.pow( probs[s.name], 3 );
    }
  }

  // Pair odds (complex calculation)
  // P(exactly two match) = sum over all symbols of: 3 * p^2 * (1-p)
  let pairOdds = 0;
  for ( const s of SYMBOLS ) {
    const p = probs[s.name];
    pairOdds += 3 * p * p * ( 1 - p );
  }

  // Loss odds = 1 - (all winning outcomes)
  const totalWinOdds = jackpotOdds + tripleQuarkOdds + anyTripleOdds + pairOdds;
  const lossOdds = 1 - totalWinOdds;

  return {
    jackpot: `1 in ${Math.round( 1 / jackpotOdds ).toLocaleString()}`,
    triple_quark: `1 in ${Math.round( 1 / tripleQuarkOdds ).toLocaleString()}`,
    triple: `1 in ${Math.round( 1 / anyTripleOdds ).toLocaleString()}`,
    pair: `${( pairOdds * 100 ).toFixed( 1 )}%`,
    loss: `${( lossOdds * 100 ).toFixed( 1 )}%`
  };
}

// Exports
export default {
  spin,
  getSymbolEmoji,
  getReelsDisplay,
  getResultTypeName,
  getOdds,
  PAYOUTS,
  SYMBOLS
};
