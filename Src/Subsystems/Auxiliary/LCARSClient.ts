// -- LCARS Client --

//Imports
import { SlashCommandBuilder } from "@discordjs/builders";
import {Client, Collection, CommandInteraction} from "discord.js";

//Exports
export interface LCARSClient extends Client {
    CMD_INDEX: Collection<
        string,
        {
            name: string,
            data: SlashCommandBuilder;
            ownerOnly?: boolean;
            execute: (LCARS47: LCARSClient, int: CommandInteraction) => Promise<void>;
            help: () => void;
        }
    >;
}