// -- System Utilities --

//Imports
import colors from 'colors/safe';
import { DateTime } from "luxon";

//Exports
export default {
    log(level: string, data: string): void {
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
    },
    flexTime(date?: Date): string {
        let newFlex: string;
        if (!date) {
            newFlex = DateTime.now().setZone('UTC-5').toLocaleString(DateTime.DATE_MED);
        }
        else {
            newFlex = DateTime.fromJSDate(date).toLocaleString(DateTime.DATE_MED);
        }

        return newFlex;
    }
}