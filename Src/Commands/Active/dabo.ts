// -- DABO --
// Ferengi gambling game from Star Trek: Deep Space Nine

// Imports
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import {
  type AutocompleteInteraction,
  type BooleanCache,
  type ButtonInteraction,
  type CacheType,
  type ChatInputCommandInteraction,
  type InteractionResponse,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import Utility from '../../Subsystems/Utilities/SysUtils.js';
import DaboUtilities from '../../Subsystems/Dabo/Dabo_Utilities.js';
import DaboGameLogic from '../../Subsystems/Dabo/Dabo_GameLogic.js';
import DaboMessages from '../../Subsystems/Dabo/Dabo_Messages.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface.js';
import type { DaboLeaderboardType } from '../../Subsystems/Auxiliary/Interfaces/DaboInterfaces.js';

// Command Data
const data = new SlashCommandBuilder()
  .setName( 'dabo' )
  .setDescription( 'Play Dabo - the Ferengi gambling game from Quark\'s Bar!' );

// Subcommand: spin
data.addSubcommand( s => s
  .setName( 'spin' )
  .setDescription( 'Spin the Dabo wheel!' )
  .addIntegerOption( o => o
    .setName( 'bet' )
    .setDescription( 'Amount of GPL to wager (0 or omit for free play)' )
    .setMinValue( 0 )
    .setMaxValue( 10000 )
    .setRequired( false )
  )
);

// Subcommand: account
data.addSubcommand( s => s
  .setName( 'account' )
  .setDescription( 'View your Dabo player account and statistics' )
);

// Subcommand: leaderboard
data.addSubcommand( s => s
  .setName( 'leaderboard' )
  .setDescription( 'View the top Dabo players' )
  .addStringOption( o => o
    .setName( 'type' )
    .setDescription( 'Leaderboard ranking type' )
    .setRequired( false )
    .addChoices(
      { name: 'Balance (GPL)', value: 'balance' },
      { name: 'Total Winnings', value: 'winnings' },
      { name: 'Jackpots', value: 'jackpots' }
    )
  )
);

// Main execute function
async function execute (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction | AutocompleteInteraction
): Promise<InteractionResponse<BooleanCache<CacheType>> | void> {
  if ( int.isAutocomplete() ) {
    return await int.respond( [
      { name: 'This command does not support autocomplete.', value: 'none' }
    ] );
  }

  const subCmd = int.options.getSubcommand();
  Utility.log( 'info', `[DABO] Received ${subCmd} command from ${int.user.tag}` );

  switch ( subCmd ) {
    case 'spin':
      return await handleSpin( LCARS47, int );
    case 'account':
      return await handleAccount( LCARS47, int );
    case 'leaderboard':
      return await handleLeaderboard( LCARS47, int );
    default:
      return await int.reply( {
        content: 'Unknown Dabo command.',
        flags: MessageFlags.Ephemeral
      } );
  }
}

// Handle spin subcommand
async function handleSpin (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction
): Promise<InteractionResponse> {
  const bet = int.options.getInteger( 'bet' ) ?? 0;
  const userId = int.user.id;

  // Get or create player
  const player = await DaboUtilities.getPlayer( LCARS47.RDS_CONNECTION, userId );

  // Check if player has enough GPL for the bet
  if ( bet > 0 && player.balance < bet ) {
    return await int.reply( {
      embeds: [
        new EmbedBuilder()
          .setColor( 0xFF6B6B )
          .setTitle( '🚫 Insufficient Funds' )
          .setDescription( DaboMessages.getInsufficientFundsMessage() )
          .addFields(
            { name: 'Your Balance', value: `${player.balance.toLocaleString()} GPL`, inline: true },
            { name: 'Bet Amount', value: `${bet.toLocaleString()} GPL`, inline: true }
          )
          .setFooter( { text: 'Lower your bet or play for free!' } )
      ],
      flags: MessageFlags.Ephemeral
    } );
  }

  // Spin the wheel
  const result = DaboGameLogic.spin( bet );

  // Update player stats
  let updateResult;
  if ( bet > 0 ) {
    updateResult = await DaboUtilities.updatePlayerAfterSpin(
      LCARS47.RDS_CONNECTION,
      userId,
      bet,
      result
    );
  }
  else {
    updateResult = await DaboUtilities.updatePlayerFreePlay(
      LCARS47.RDS_CONNECTION,
      userId,
      result
    );
  }

  // Build result embed
  const embed = buildSpinResultEmbed( result, bet, updateResult.player, updateResult.balanceChange );

  // Build action row with buttons
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId( `dabo_spin_${userId}_${bet}` )
        .setLabel( bet > 0 ? `Spin Again (${bet} GPL)` : 'Spin Again' )
        .setStyle( result.isWin ? ButtonStyle.Success : ButtonStyle.Primary )
        .setEmoji( '🎰' ),
      new ButtonBuilder()
        .setCustomId( `dabo_account_${userId}` )
        .setLabel( 'View Account' )
        .setStyle( ButtonStyle.Secondary )
        .setEmoji( '📊' )
    );

  return await int.reply( { embeds: [embed], components: [row] } );
}

// Build embed for spin result
function buildSpinResultEmbed (
  result: ReturnType<typeof DaboGameLogic.spin>,
  bet: number,
  player: Awaited<ReturnType<typeof DaboUtilities.getPlayer>>,
  balanceChange: number
): EmbedBuilder {
  const isFreePlay = bet === 0;

  // Determine color based on result
  let color: number;
  if ( result.resultType === 'jackpot' ) {
    color = 0xFFD700; // Gold for jackpot
  }
  else if ( result.isWin ) {
    color = 0x57F287; // Green for win
  }
  else {
    color = 0xED4245; // Red for loss
  }

  const embed = new EmbedBuilder()
    .setColor( color )
    .setTitle( '🎰 Dabo Wheel 🎰' )
    .setDescription( DaboGameLogic.getReelsDisplay( result.reels ) )
    .addFields(
      { name: 'Result', value: DaboGameLogic.getResultTypeName( result.resultType ), inline: true }
    );

  // Add payout info
  if ( isFreePlay ) {
    embed.addFields(
      { name: 'Mode', value: DaboMessages.getFreePlaysMessage(), inline: true }
    );
  }
  else if ( result.isWin ) {
    embed.addFields(
      { name: 'Payout', value: `+${result.payout.toLocaleString()} GPL (${result.multiplier}x) (${ balanceChange })`, inline: true }
    );
  }
  else {
    embed.addFields(
      { name: 'Loss', value: `-${bet.toLocaleString()} GPL (${ balanceChange })`, inline: true }
    );
  }

  // Add balance
  embed.addFields(
    { name: 'Balance', value: `${player.balance.toLocaleString()} GPL`, inline: true }
  );

  // Add flavor text
  embed.addFields(
    { name: '\u200B', value: `*${DaboMessages.getResultMessage( result.resultType )}*` }
  );

  // Add streak info if notable
  const streakMsg = DaboMessages.getStreakMessage( player.currentStreak );
  if ( streakMsg ) {
    embed.setFooter( { text: streakMsg } );
  }

  return embed;
}

// Handle account subcommand
async function handleAccount (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction
): Promise<InteractionResponse> {
  const userId = int.user.id;
  const player = await DaboUtilities.getPlayer( LCARS47.RDS_CONNECTION, userId );

  // Calculate win rate
  const winRate = player.gamesPlayed > 0
    ? ( ( player.gamesWon / player.gamesPlayed ) * 100 ).toFixed( 1 )
    : '0.0';

  // Calculate net profit/loss
  const netProfit = player.totalWinnings - player.totalLosses;
  const netProfitDisplay = netProfit >= 0
    ? `+${netProfit.toLocaleString()} GPL`
    : `${netProfit.toLocaleString()} GPL`;

  const embed = new EmbedBuilder()
    .setColor( 0xC9A227 ) // Gold-pressed latinum color
    .setTitle( `🎰 Dabo Account: ${int.user.displayName}` )
    .setThumbnail( int.user.displayAvatarURL() )
    .addFields(
      { name: '💰 Balance', value: `${player.balance.toLocaleString()} GPL`, inline: true },
      { name: '📈 Net Profit', value: netProfitDisplay, inline: true },
      { name: '🎯 Win Rate', value: `${winRate}%`, inline: true },
      { name: '🎲 Games Played', value: player.gamesPlayed.toLocaleString(), inline: true },
      { name: '🏆 Games Won', value: player.gamesWon.toLocaleString(), inline: true },
      { name: '🎰 Jackpots', value: player.jackpotCount.toLocaleString(), inline: true },
      { name: '📊 Total Winnings', value: `${player.totalWinnings.toLocaleString()} GPL`, inline: true },
      { name: '📉 Total Losses', value: `${player.totalLosses.toLocaleString()} GPL`, inline: true },
      { name: '🔥 Longest Streak', value: `${player.longestWinStreak} wins`, inline: true }
    )
    .setFooter( { text: `Account created: Stardate ${Utility.stardate( player.createdAt )}` } );

  // Add current streak if notable
  if ( Math.abs( player.currentStreak ) >= 3 ) {
    const streakType = player.currentStreak > 0 ? 'Win' : 'Loss';
    embed.addFields(
      { name: '📍 Current Streak', value: `${Math.abs( player.currentStreak )} ${streakType.toLowerCase()}${Math.abs( player.currentStreak ) > 1 ? 'es' : ''}` }
    );
  }

  return await int.reply( { embeds: [embed] } );
}

// Handle leaderboard subcommand
async function handleLeaderboard (
  LCARS47: LCARSClient,
  int: ChatInputCommandInteraction
): Promise<InteractionResponse> {
  const type = ( int.options.getString( 'type' ) ?? 'balance' ) as DaboLeaderboardType;

  const leaderboard = await DaboUtilities.getLeaderboard( LCARS47.RDS_CONNECTION, type, 10 );

  if ( leaderboard.length === 0 ) {
    return await int.reply( {
      content: 'No Dabo players found yet! Be the first to spin the wheel!',
      flags: MessageFlags.Ephemeral
    } );
  }

  // Build leaderboard entries
  const entries: string[] = [];
  for ( const entry of leaderboard ) {
    try {
      const user = await LCARS47.users.fetch( entry.discordId );
      const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}.`;

      let valueDisplay: string;
      if ( type === 'jackpots' ) {
        valueDisplay = `${entry.value} jackpot${entry.value !== 1 ? 's' : ''}`;
      }
      else {
        valueDisplay = `${entry.value.toLocaleString()} GPL`;
      }

      entries.push( `${medal} **${user.displayName}** - ${valueDisplay}` );
    }
    catch {
      // User not found, skip
      entries.push( `${entry.rank}. *Unknown Player* - ${entry.value.toLocaleString()}` );
    }
  }

  // Determine title based on type
  let title: string;
  switch ( type ) {
    case 'balance':
      title = '💰 Top Dabo Players by Balance';
      break;
    case 'winnings':
      title = '📈 Top Dabo Players by Total Winnings';
      break;
    case 'jackpots':
      title = '🎰 Top Dabo Players by Jackpots';
      break;
  }

  const embed = new EmbedBuilder()
    .setColor( 0xC9A227 )
    .setTitle( title )
    .setDescription( entries.join( '\n' ) )
    .setFooter( { text: 'Rule of Acquisition #10: Greed is eternal.' } );

  return await int.reply( { embeds: [embed] } );
}

// Handle button interactions
async function handleButton (
  LCARS47: LCARSClient,
  int: ButtonInteraction
): Promise<void> {
  const parts = int.customId.split( '_' );
  // Format: dabo_action_userId_[optional data]
  const action = parts[1];
  const targetUserId = parts[2];

  // Verify the user clicking is the original player
  if ( int.user.id !== targetUserId ) {
    await int.reply( {
      content: '"Hey! That\'s not your wheel!" -Quark',
      flags: MessageFlags.Ephemeral
    } );
    return;
  }

  switch ( action ) {
    case 'spin': {
      const bet = parseInt( parts[3] ?? '0', 10 );
      await handleButtonSpin( LCARS47, int, bet );
      break;
    }
    case 'account': {
      await handleButtonAccount( LCARS47, int );
      break;
    }
    default:
      await int.reply( {
        content: 'Unknown button action.',
        flags: MessageFlags.Ephemeral
      } );
  }
}

// Handle spin button
async function handleButtonSpin (
  LCARS47: LCARSClient,
  int: ButtonInteraction,
  bet: number
): Promise<void> {
  const userId = int.user.id;

  // Get player
  const player = await DaboUtilities.getPlayer( LCARS47.RDS_CONNECTION, userId );

  // Check funds
  if ( bet > 0 && player.balance < bet ) {
    await int.reply( {
      embeds: [
        new EmbedBuilder()
          .setColor( 0xFF6B6B )
          .setTitle( '🚫 Insufficient Funds' )
          .setDescription( DaboMessages.getInsufficientFundsMessage() )
          .addFields(
            { name: 'Your Balance', value: `${player.balance.toLocaleString()} GPL`, inline: true },
            { name: 'Bet Amount', value: `${bet.toLocaleString()} GPL`, inline: true }
          )
      ],
      flags: MessageFlags.Ephemeral
    } );
    return;
  }

  // Spin
  const result = DaboGameLogic.spin( bet );

  // Update stats
  let updateResult;
  if ( bet > 0 ) {
    updateResult = await DaboUtilities.updatePlayerAfterSpin(
      LCARS47.RDS_CONNECTION,
      userId,
      bet,
      result
    );
  }
  else {
    updateResult = await DaboUtilities.updatePlayerFreePlay(
      LCARS47.RDS_CONNECTION,
      userId,
      result
    );
  }

  // Build result
  const embed = buildSpinResultEmbed( result, bet, updateResult.player, updateResult.balanceChange );

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId( `dabo_spin_${userId}_${bet}` )
        .setLabel( bet > 0 ? `Spin Again (${bet} GPL)` : 'Spin Again' )
        .setStyle( result.isWin ? ButtonStyle.Success : ButtonStyle.Primary )
        .setEmoji( '🎰' ),
      new ButtonBuilder()
        .setCustomId( `dabo_account_${userId}` )
        .setLabel( 'View Account' )
        .setStyle( ButtonStyle.Secondary )
        .setEmoji( '📊' )
    );

  await int.update( { embeds: [embed], components: [row] } );
}

// Handle account button
async function handleButtonAccount (
  LCARS47: LCARSClient,
  int: ButtonInteraction
): Promise<void> {
  const userId = int.user.id;
  const player = await DaboUtilities.getPlayer( LCARS47.RDS_CONNECTION, userId );

  const winRate = player.gamesPlayed > 0
    ? ( ( player.gamesWon / player.gamesPlayed ) * 100 ).toFixed( 1 )
    : '0.0';

  const netProfit = player.totalWinnings - player.totalLosses;
  const netProfitDisplay = netProfit >= 0
    ? `+${netProfit.toLocaleString()} GPL`
    : `${netProfit.toLocaleString()} GPL`;

  const embed = new EmbedBuilder()
    .setColor( 0xC9A227 )
    .setTitle( `🎰 Dabo Account: ${int.user.displayName}` )
    .setThumbnail( int.user.displayAvatarURL() )
    .addFields(
      { name: '💰 Balance', value: `${player.balance.toLocaleString()} GPL`, inline: true },
      { name: '📈 Net Profit', value: netProfitDisplay, inline: true },
      { name: '🎯 Win Rate', value: `${winRate}%`, inline: true },
      { name: '🎲 Games Played', value: player.gamesPlayed.toLocaleString(), inline: true },
      { name: '🏆 Games Won', value: player.gamesWon.toLocaleString(), inline: true },
      { name: '🎰 Jackpots', value: player.jackpotCount.toLocaleString(), inline: true }
    )
    .setFooter( { text: `Stardate ${Utility.stardate()}` } );

  await int.reply( { embeds: [embed], flags: MessageFlags.Ephemeral } );
}

// Help function
function help (): string {
  return 'Play Dabo - the Ferengi gambling game! Spin the wheel, win Gold-Pressed Latinum.';
}

// Exports
export default {
  name: 'dabo',
  data,
  execute,
  handleButton,
  help
} satisfies Command;
