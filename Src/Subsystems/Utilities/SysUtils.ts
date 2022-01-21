// -- System Utilities --

//Imports
import colors from 'colors/safe';

//Exports
export default {
    log(level: string, data: string) {
        switch (level) {
            case 'proc':
                console.log(colors.green(data));
                break;
            case 'info':
                console.info(data);
                break;
            case 'warn':
                console.warn(colors.yellow(data));
                break;
            case 'err':
                console.error(colors.red(data));
        }
    }
}