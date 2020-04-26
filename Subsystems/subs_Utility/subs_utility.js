// -- Utility --

module.exports = {
    statusReader,
    rewriteDate,
    rewriteTime,
    rewriteDateTime,
    convertMs,
    convertMSFUll
}

function statusReader(status) {
    switch (status) {
        case 0:
            return "ONLINE";
        case 1:
            return "CONNECTING";
        case 2:
            return "RECONNECTING";
        case 3:
            return "IDLE";
        case 4:
            return "NEARLY";
        case 5:
            return "OFFLINE";
        case 6:
            return "PENDING DOCKING";
        case 7:
            return "IDENTIFYING";
        case 8:
            return "RESUMING";
        default:
            return "UNKNOWN";
    }
}

function rewriteDate(date) {
    return `${date.toDateString()}`
}

function rewriteTime(date) {
    return `${date.getHours()}:${date.getMinutes()}`;
}

function rewriteDateTime(date) {
    return `${rewriteDate(date)} ${rewriteTime(date)}`;
}

function convertMs(ms) {
    ms = ms * -1;
    let day, hour, minute, seconds;

    seconds = Math.floor(ms / 1000);
    minute = Math.floor(seconds / 60);
    seconds = seconds % 60;
    hour = Math.floor(minute / 60);
    minute = minute % 60;
    day = Math.floor(hour / 24);
    hour = hour % 24;

    return {
        day: day,
        hour: hour,
        minute: minute,
        seconds: seconds
    };
}

function convertMSFUll(ms) {
    ms = ms * -1;
    let day, hour, minute, seconds;

    seconds = Math.floor(ms / 1000);
    minute = Math.floor(seconds / 60);
    seconds = seconds % 60;
    hour = Math.floor(minute / 60);
    minute = minute % 60;
    day = Math.floor(hour / 24);
    hour = hour % 24;

    return `${day} Days, ${hour} Hrs, ${minute} Minutes, ${seconds} Seconds`;
}