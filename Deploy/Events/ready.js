"use strict";
// -- READY EVENT --
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const SysUtils_1 = __importDefault(require("../Subsystems/Utilities/SysUtils"));
//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute: async () => {
        SysUtils_1.default.log('proc', '[CLIENT] IM ALIVE!');
    }
};
