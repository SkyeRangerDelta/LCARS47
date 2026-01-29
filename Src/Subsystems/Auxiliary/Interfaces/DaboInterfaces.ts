// ---- Dabo Game Interfaces ----

// Symbol types on the Dabo wheel
export type DaboSymbol = 'latinum' | 'ferengi' | 'bar' | 'star' | 'quark' | 'odo';

// Symbol display configuration
export interface DaboSymbolConfig {
  name: DaboSymbol
  emoji: string
  weight: number  // Higher = more common
}

// Result types from a spin
export type DaboResultType = 'jackpot' | 'triple_quark' | 'triple' | 'pair' | 'loss';

// A single spin result
export interface DaboSpinResult {
  reels: [DaboSymbol, DaboSymbol, DaboSymbol]
  resultType: DaboResultType
  multiplier: number  // 0 for loss, positive for wins
  payout: number      // Actual GPL won (bet * multiplier)
  isWin: boolean
}

// Player account stored in MongoDB
export interface DaboPlayer {
  discordId: string           // Unique identifier
  balance: number             // Current GPL balance
  totalWinnings: number       // Lifetime GPL won
  totalLosses: number         // Lifetime GPL lost
  gamesPlayed: number         // Total spins
  gamesWon: number            // Total winning spins
  jackpotCount: number        // Number of "DABO!" jackpots
  currentStreak: number       // Positive = wins, negative = losses
  longestWinStreak: number    // Best win streak ever
  createdAt: Date             // Account creation timestamp
  lastPlayedAt: Date          // Last spin timestamp
}

// Data returned after updating a player's stats
export interface DaboUpdateResult {
  player: DaboPlayer
  balanceChange: number
  newBalance: number
}

// Leaderboard entry for display
export interface DaboLeaderboardEntry {
  rank: number
  discordId: string
  value: number           // The metric being ranked (balance, winnings, etc.)
  displayName?: string    // Resolved Discord username
}

// Leaderboard types
export type DaboLeaderboardType = 'balance' | 'winnings' | 'jackpots';

// Button interaction custom IDs
export interface DaboButtonData {
  action: 'spin' | 'change_bet' | 'account'
  userId: string
  bet?: number
}
