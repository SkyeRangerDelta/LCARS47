"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertDuration = void 0;
function convertDuration(time) {
    if (time === 0) {
        return 'Livestream';
    }
    else if (time < 3600) {
        return new Date(time * 1000).toISOString().substr(14, 5);
    }
    else {
        return new Date(time * 1000).toISOString().substr(11, 8);
    }
}
exports.convertDuration = convertDuration;
