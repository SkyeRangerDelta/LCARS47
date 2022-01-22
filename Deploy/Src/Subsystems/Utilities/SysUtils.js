"use strict";
// -- System Utilities --
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const safe_1 = __importDefault(require("colors/safe"));
//Exports
exports.default = {
    log(level, data) {
        switch (level) {
            case 'proc':
                console.log(safe_1.default.green(data));
                break;
            case 'info':
                console.info(data);
                break;
            case 'warn':
                console.warn(safe_1.default.yellow(data));
                break;
            case 'err':
                console.error(safe_1.default.red(data));
        }
    }
};
