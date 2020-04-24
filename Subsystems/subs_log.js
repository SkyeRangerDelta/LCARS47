// -- Log System --

const colors = require(`colors`);

module.exports = {
    botLog: function botLog(level, msg) {
        switch (level) {
            case `info`:
                console.log(`[INFO] ${msg}`);
                break;
    
            case `warn`:
                console.log(colors.yellow(`[WARN] ${msg}`));
                break;
    
            case `err`:
                console.log(colors.red(`[ERROR] ${msg}`));
                break;
    
            case `proc`:
                console.log(colors.green(`[SUCCESS] ${msg}`));
                break;
    
            default:
                console.log(colors.bgYellow(`[UNKNOWN ERROR] ${msg}`));
                break;
        }
    }
}