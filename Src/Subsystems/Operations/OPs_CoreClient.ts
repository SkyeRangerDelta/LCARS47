// -- System Client --
// Handles the start of a client

//Imports
import { Client, Collection, CommandInteraction, GatewayIntentBits, Guild, GuildMember } from 'discord.js';
import { SlashCommandBuilder } from "@discordjs/builders";
import { MongoClient } from "mongodb";
import fs from "fs";

import { LCARSMediaPlayer } from "../Auxiliary/Interfaces/MediaInterfaces";
import { StatusInterface } from "../Auxiliary/Interfaces/StatusInterface";
import envChecks from "../Auxiliary/EnvChecks.json";

import EventsIndexer from "./OPs_EventIndexer";
import CommandIndexer from "./OPs_CmdHandler";
import Utility from "../Utilities/SysUtils";

//Exports
/**
 * The LCARS47Client class - represents the core of the bot.
 */
export class LCARS47Client extends Client {

    public TEST_MODE: boolean;
    public HEARTBEAT: boolean;
    public PLDYN: Guild | null = null;
    public MEDIA_QUEUE: Map<string, LCARSMediaPlayer> | null = null;
    public RDS_CONNECTION: MongoClient | null = null;
    public CLIENT_STATS: StatusInterface | null = null;
    public VERSION: string;
    public CMD_INDEX: Collection<
        string,
        {
            name: string;
            data: SlashCommandBuilder;
            ownerOnly?: boolean;
            execute: (LCARS47: LCARS47Client, int: CommandInteraction) => Promise<void>;
            help: () => void;
        }>;

    constructor() {
        super(
            {
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.GuildVoiceStates,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.GuildMessageTyping,
                    GatewayIntentBits.MessageContent
                ]
            });
        this.CMD_INDEX = new Collection();

        //Read package
        const {version} = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
        this.VERSION = version;

        //Check for test mode
        if (process.argv.includes('test')) {
            Utility.log('info', '[CLIENT] Test mode enabled, running dev environment parameters.');
            this.TEST_MODE = true;
        } else {
            this.TEST_MODE = false;
        }

        //Check for heartbeat
        this.HEARTBEAT = process.argv.includes('heartbeat');
    }

    async doBoot() {
        await this.runEnvChecks();
        await this.runIndexers();
        await this.runChannelIndexing();
    }

    async runIndexers() {
        await EventsIndexer.indexEvents(this);
        await CommandIndexer.indexCommands(this);
    }

    async runChannelIndexing() {
        console.log("Indexing channels...");
    }

    async runEnvChecks() {
        //Perform ENV checks
        for (const reqEnv of envChecks.env_required) {
            if (!process.env[ reqEnv ]) {
                Utility.log('error', `[CLIENT] Missing required ENV variable: ${ reqEnv }`);
                process.exit(2);
            }
        }

        for (const optEnv of envChecks.env_optional) {
            if (!process.env[ optEnv ]) {
                Utility.log('warn', `[CLIENT] Missing optional ENV variable: ${ optEnv }`);
            }
        }
    }
}