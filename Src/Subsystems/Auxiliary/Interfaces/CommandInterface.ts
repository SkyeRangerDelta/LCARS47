import { type LCARSClient } from '../LCARSClient';
import {
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction
} from 'discord.js';
import { type SlashCommandBuilder } from '@discordjs/builders';

export interface Command {
  name: string
  data: SlashCommandBuilder
  ownerOnly?: boolean
  execute: ( LCARSClient: LCARSClient, interaction: ChatInputCommandInteraction | AutocompleteInteraction ) => unknown
  handleButton?: ( LCARSClient: LCARSClient, interaction: ButtonInteraction ) => unknown
  handleSelect?: ( LCARSClient: LCARSClient, interaction: StringSelectMenuInteraction ) => unknown
  help: () => string
}
