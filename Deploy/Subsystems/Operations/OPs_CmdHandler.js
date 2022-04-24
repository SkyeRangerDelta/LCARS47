"use strict";
// -- COMMAND HANDLER --
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const fs = __importStar(require("fs"));
const SysUtils_1 = __importDefault(require("../Utilities/SysUtils"));
const path_1 = __importDefault(require("path"));
const rest_1 = require("@discordjs/rest");
const OPs_Vars_json_1 = require("./OPs_Vars.json");
const v9_1 = require("discord-api-types/v9");
//Exports
const CommandIndexer = {
    indexCommands
};
exports.default = CommandIndexer;
//Functions
async function indexCommands(LCARS47) {
    const cmdJSON = [];
    const cmdPath = path_1.default.join(__dirname, '../..', 'Commands/Active');
    const commandIndex = fs.readdirSync(cmdPath).filter(f => f.endsWith('.js'));
    for (const command of commandIndex) {
        const cPath = `../../Commands/Active/${command}`;
        await Promise.resolve().then(() => __importStar(require(cPath))).then(c => {
            const cmd = c.default;
            SysUtils_1.default.log('info', `[CMD-INDEXER] Indexing ${cmd.name}`);
            cmdJSON.push(cmd.data.toJSON());
            LCARS47.CMD_INDEX.set(cmd.data.name, cmd);
        });
    }
    SysUtils_1.default.log('warn', '[CMD-INDEXER] Starting command registration update.');
    const rest = new rest_1.REST({ version: '9' }).setToken(process.env.TOKEN);
    try {
        await rest.put(v9_1.Routes.applicationGuildCommands(OPs_Vars_json_1.LCARSID, OPs_Vars_json_1.PLDYNID), { body: cmdJSON });
        SysUtils_1.default.log('warn', '[CMD-INDEXER] Finished command registration update.');
    }
    catch (cmdIndexErr) {
        SysUtils_1.default.log('err', '[CMD-INDEXER] ERROR REGISTERING/UPDATING SLASH COMMANDS!\n' + cmdIndexErr);
        LCARS47.destroy();
        process.exit();
    }
}
