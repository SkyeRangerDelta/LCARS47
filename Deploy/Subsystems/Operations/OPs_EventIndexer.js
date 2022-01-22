"use strict";
// -- Events Indexer --
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
const path = __importStar(require("path"));
//Exports
const EventsIndexer = {
    indexEvents
};
exports.default = EventsIndexer;
//Functions
async function indexEvents(LCARS47) {
    const evPath = path.join(__dirname, '../..', 'Events');
    const eventsIndex = fs.readdirSync(evPath).filter(f => f.endsWith('.ts'));
    for (const event of eventsIndex) {
        await Promise.resolve().then(() => __importStar(require(`../../Events/${event}`))).then(e => {
            const ev = e.default;
            SysUtils_1.default.log('info', `[EVENT-HANDLER] Indexing ${ev.name}`);
            if (ev.once) {
                LCARS47.once(ev.name, (...args) => ev.execute(LCARS47, ...args));
            }
            else {
                LCARS47.on(ev.name, (...args) => ev.execute(LCARS47, ...args));
            }
        });
    }
}
