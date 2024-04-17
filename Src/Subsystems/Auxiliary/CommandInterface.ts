import { type LCARSClient } from './LCARSClient';
import { type ChatInputCommandInteraction } from 'discord.js';
import { type SlashCommandBuilder } from '@discordjs/builders';

export interface Command {
  name: string
  data: SlashCommandBuilder
  ownerOnly?: boolean
  execute: ( LCARSClient: LCARSClient, interaction: ChatInputCommandInteraction ) => any
  help: () => string
}
