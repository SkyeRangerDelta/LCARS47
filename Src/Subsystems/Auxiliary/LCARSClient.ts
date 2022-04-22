// -- LCARS Client --

//Imports
import { SlashCommandBuilder } from "@discordjs/builders";
import {Client, Collection, CommandInteraction, Guild, GuildMember} from "discord.js";
import {LCARSMediaPlayer} from "./MediaInterfaces";
import {MongoClient} from "mongodb";

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
    PLDYN: Guild;
    MEMBER: GuildMember;
    MEDIA_QUEUE: Map<string, LCARSMediaPlayer>;
    RDS_CONNECTION: MongoClient;
}