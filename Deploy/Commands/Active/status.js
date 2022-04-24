"use strict";
// -- STATUS --
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const RDS_Utilities_1 = __importDefault(require("../../Subsystems/RemoteDS/RDS_Utilities"));
const SysUtils_1 = __importDefault(require("../../Subsystems/Utilities/SysUtils"));
//Functions
const data = new builders_1.SlashCommandBuilder()
    .setName('status')
    .setDescription('Displays a report of all LCARS47s system states and session variables.');
async function execute(LCARS47, int) {
    SysUtils_1.default.log('info', '[AUXILIARY] Received status display request.');
    const trData = {
        coll: 'rds_status',
        key: 'selectAll'
    };
    const statusRP = await RDS_Utilities_1.default.rds_selectOne(LCARS47.RDS_CONNECTION, 'rds_status', 1);
    // @ts-ignore
    await int.reply({ content: `LCARS RDS Status Report:\nState: ${statusRP.status}\nQueries: ${statusRP.queries}` });
}
function help() {
    return 'Displays a report of all LCARS47s system states and session variables.';
}
//Exports
exports.default = {
    name: 'Status',
    data,
    execute,
    help
};
