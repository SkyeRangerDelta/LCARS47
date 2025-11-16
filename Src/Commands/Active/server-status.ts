// Server Status Command
// Retrieves system metrics from Beszel monitoring hub

import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import {
  type ChatInputCommandInteraction,
  type AutocompleteInteraction
} from 'discord.js';
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';
import BeszelUtils from '../../Subsystems/RemoteDS/Beszel_Utilities.js';
import Utility from '../../Subsystems/Utilities/SysUtils.js';

const data = new SlashCommandBuilder()
  .setName('server-status')
  .setDescription('Retrieves system status from Beszel monitoring hub.')
  .addStringOption(option => option
    .setName('system')
    .setDescription('Select a system to check')
    .setAutocomplete(true)
    .setRequired(true)
  ) as SlashCommandBuilder;

async function execute(LCARS47: LCARSClient, int: ChatInputCommandInteraction | AutocompleteInteraction): Promise<unknown> {
  // Handle autocomplete interaction
  if (int.isAutocomplete()) {
    try {
      // Use cached systems list from LCARS47.BESZEL_SYSTEMS
      const systems = LCARS47.BESZEL_SYSTEMS || [];

      // Filter based on user input if they're typing
      const focusedValue = int.options.getFocused().toLowerCase();
      const filtered = systems.filter(system =>
        system.name.toLowerCase().includes(focusedValue)
      );

      const choices = filtered.map(system => ({
        name: `${system.name} (${system.status})`,
        value: system.id
      }));

      // Discord allows max 25 choices
      return await int.respond(choices.slice(0, 25));
    } catch (error) {
      Utility.log('err', `[SERVER-STATUS] Autocomplete error: ${(error as Error).message}`);
      return await int.respond([]);
    }
  }

  // Handle command execution
  if (!int.isChatInputCommand()) return;

  Utility.log('info', '[SERVER-STATUS] Received server status request.');

  // Check if Beszel client is available
  if (!LCARS47.BESZEL_CLIENT?.authStore.isValid) {
    return await int.reply({
      content: 'Beszel monitoring is currently unavailable. Please contact an administrator.',
      ephemeral: true
    });
  }

  await int.deferReply();

  try {
    const systemId = int.options.getString('system', true);

    // Fetch system metrics using utilities
    const metrics = await BeszelUtils.beszel_getMetrics(LCARS47.BESZEL_CLIENT, systemId);

    // Determine embed color based on system status
    const embedColor = metrics.status.toLowerCase() === 'up' ? 0x00FF00 : 0xFF0000;

    // Build Discord embed
    const embed = new EmbedBuilder()
      .setTitle(`🖥️ System Status: ${metrics.name}`)
      .setColor(embedColor)
      .addFields(
        {
          name: '📊 Status',
          value: metrics.status.toUpperCase(),
          inline: true
        },
        {
          name: '💻 CPU Usage',
          value: `${metrics.cpu.toFixed(1)}%`,
          inline: true
        },
        {
          name: '🧠 Memory',
          value: `${metrics.memUsed} / ${metrics.memTotal}\n(${metrics.memPercent.toFixed(1)}%)`,
          inline: true
        },
        {
          name: '💾 Disk',
          value: `${metrics.diskUsed} / ${metrics.diskTotal}\n(${metrics.diskPercent.toFixed(1)}%)`,
          inline: true
        },
        {
          name: '🌐 Network',
          value: `↓ ${metrics.netDown}\n↑ ${metrics.netUp}`,
          inline: true
        },
        {
          name: '⏱️ Uptime',
          value: metrics.uptime,
          inline: true
        }
      )
      .setTimestamp()
      .setFooter({ text: 'Beszel Monitoring System' });

    // Add temperature if available
    if (metrics.temperature !== undefined) {
      embed.addFields({
        name: '🌡️ Temperature',
        value: `${metrics.temperature.toFixed(1)}°C`,
        inline: true
      });
    }

    await int.editReply({ embeds: [embed] });

    Utility.log('proc', `[SERVER-STATUS] Successfully displayed metrics for ${metrics.name}.`);

  } catch (error) {
    Utility.log('err', `[SERVER-STATUS] Failed to fetch metrics: ${(error as Error).message}`);

    return await int.editReply({
      content: `Failed to retrieve system status: ${(error as Error).message}`
    });
  }
}

function help(): string {
  return 'Retrieves real-time system metrics from Beszel monitoring hub. Displays CPU, memory, disk, network usage, and uptime for the selected system.';
}

export default {
  name: 'server-status',
  data,
  execute,
  help
} satisfies Command;
