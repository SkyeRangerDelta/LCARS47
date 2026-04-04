// ---- Dabo Database Utilities ----

// Imports
import { type MongoClient, type Db } from 'mongodb';
import Utility from '../Utilities/SysUtils.js';
import type {
  DaboPlayer,
  DaboUpdateResult,
  DaboLeaderboardEntry,
  DaboLeaderboardType,
  DaboSpinResult
} from '../Auxiliary/Interfaces/DaboInterfaces.js';

// Constants
const COLLECTION_NAME = 'dabo_players';
const STARTING_BALANCE = 1000;

// Helper to get database
function getDatabase ( connection: MongoClient ): Db {
  return connection.db( 'LCARS47_DS' );
}

// Get or create a player account
async function getPlayer ( connection: MongoClient, discordId: string ): Promise<DaboPlayer> {
  Utility.log( 'info', `[DABO] Fetching player: ${discordId}` );

  const database = getDatabase( connection );
  const collection = database.collection<DaboPlayer>( COLLECTION_NAME );

  let player = await collection.findOne( { discordId } ) as DaboPlayer;

  if ( player == null ) {
    Utility.log( 'info', `[DABO] Creating new player account for: ${discordId}` );

    const newPlayer: DaboPlayer = {
      discordId,
      balance: STARTING_BALANCE,
      totalWinnings: 0,
      totalLosses: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      jackpotCount: 0,
      currentStreak: 0,
      longestWinStreak: 0,
      createdAt: new Date(),
      lastPlayedAt: new Date()
    };

    await collection.insertOne( newPlayer );
    player = newPlayer;
  }

  return player;
}

// Update player stats after a spin
async function updatePlayerAfterSpin (
  connection: MongoClient,
  discordId: string,
  bet: number,
  result: DaboSpinResult
): Promise<DaboUpdateResult> {
  Utility.log( 'info', `[DABO] Updating player stats: ${discordId}` );

  const database = getDatabase( connection );
  const collection = database.collection<DaboPlayer>( COLLECTION_NAME );

  // Get current player state
  const player = await getPlayer( connection, discordId );

  // Calculate balance change
  const balanceChange = result.isWin ? result.payout : -bet;
  const newBalance = player.balance + balanceChange;

  // Calculate new streak
  let newStreak: number;
  if ( result.isWin ) {
    newStreak = player.currentStreak >= 0 ? player.currentStreak + 1 : 1;
  }
  else {
    newStreak = player.currentStreak <= 0 ? player.currentStreak - 1 : -1;
  }

  // Calculate longest win streak
  const newLongestStreak = Math.max( player.longestWinStreak, newStreak > 0 ? newStreak : 0 );

  // Build update object
  const updateData = {
    $set: {
      balance: newBalance,
      currentStreak: newStreak,
      longestWinStreak: newLongestStreak,
      lastPlayedAt: new Date()
    },
    $inc: {
      gamesPlayed: 1,
      gamesWon: result.isWin ? 1 : 0,
      totalWinnings: result.isWin ? result.payout : 0,
      totalLosses: result.isWin ? 0 : bet,
      jackpotCount: result.resultType === 'jackpot' ? 1 : 0
    }
  };

  await collection.updateOne( { discordId }, updateData );

  // Fetch updated player
  const updatedPlayer = await getPlayer( connection, discordId );

  return {
    player: updatedPlayer,
    balanceChange,
    newBalance
  };
}

// Update player stats for free play (no bet)
async function updatePlayerFreePlay (
  connection: MongoClient,
  discordId: string,
  result: DaboSpinResult
): Promise<DaboUpdateResult> {
  Utility.log( 'info', `[DABO] Updating free play stats: ${discordId}` );

  const database = getDatabase( connection );
  const collection = database.collection<DaboPlayer>( COLLECTION_NAME );

  // Get current player state
  const player = await getPlayer( connection, discordId );

  // Calculate new streak (still track wins/losses even in free play)
  let newStreak: number;
  if ( result.isWin ) {
    newStreak = player.currentStreak >= 0 ? player.currentStreak + 1 : 1;
  }
  else {
    newStreak = player.currentStreak <= 0 ? player.currentStreak - 1 : -1;
  }

  const newLongestStreak = Math.max( player.longestWinStreak, newStreak > 0 ? newStreak : 0 );

  // Build update object (no balance changes)
  const updateData = {
    $set: {
      currentStreak: newStreak,
      longestWinStreak: newLongestStreak,
      lastPlayedAt: new Date()
    },
    $inc: {
      gamesPlayed: 1,
      gamesWon: result.isWin ? 1 : 0,
      jackpotCount: result.resultType === 'jackpot' ? 1 : 0
    }
  };

  await collection.updateOne( { discordId }, updateData );

  // Fetch updated player
  const updatedPlayer = await getPlayer( connection, discordId );

  return {
    player: updatedPlayer,
    balanceChange: 0,
    newBalance: updatedPlayer.balance
  };
}

// Get leaderboard data
async function getLeaderboard (
  connection: MongoClient,
  type: DaboLeaderboardType,
  limit = 10
): Promise<DaboLeaderboardEntry[]> {
  Utility.log( 'info', `[DABO] Fetching leaderboard: ${type}` );

  const database = getDatabase( connection );
  const collection = database.collection<DaboPlayer>( COLLECTION_NAME );

  // Determine sort field
  let sortField: string;
  switch ( type ) {
    case 'balance':
      sortField = 'balance';
      break;
    case 'winnings':
      sortField = 'totalWinnings';
      break;
    case 'jackpots':
      sortField = 'jackpotCount';
      break;
  }

  const players = await collection
    .find( {} )
    .sort( { [sortField]: -1 } )
    .limit( limit )
    .toArray();

  return players.map( ( player, index ) => ( {
    rank: index + 1,
    discordId: player.discordId,
    value: type === 'balance' ? player.balance :
      type === 'winnings' ? player.totalWinnings :
        player.jackpotCount
  } ) );
}

// Exports
export default {
  getPlayer,
  updatePlayerAfterSpin,
  updatePlayerFreePlay,
  getLeaderboard,
  STARTING_BALANCE
};
