"use strict";
// -- MESSAGE EVENT --
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const SysUtils_1 = __importDefault(require("../Subsystems/Utilities/SysUtils"));
//Exports
exports.default = {
    name: 'messageCreate',
    execute: async (LCARS47, msg) => {
        if (msg.author.bot || (msg.author === LCARS47.user))
            return;
        SysUtils_1.default.log('proc', '[EVENT] [MSG-CREATE] Here!');
    }
};
