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
            newFlex = DateTime.now().setZone('UTC-5').toLocaleString(DateTime.DATETIME_MED);
        }
        else {
            newFlex = DateTime.fromJSDate(date).toLocaleString(DateTime.DATETIME_MED);
        }

        return newFlex;
    },
    formatMSDiff(ms: number, obj?: boolean): string | object {
        const date = new Date(ms);
        let impDate = DateTime.fromISO(date.toISOString());
        impDate = impDate.setZone('UTC-5');
        const now = DateTime.now().setZone('UTC-5');

        const diff = now.diff(impDate, ['years', 'months', 'days', 'hours', 'minutes', 'seconds']);

        if (obj) {
            return {
                human: diff.toHuman({unitDisplay: "long"}),
                diff: diff.toObject()
            } as object;
        }
        else {
            return diff.toHuman({ unitDisplay: "long" });
        }

    },
    formatProcess_mem(processData: number): number {
        return Math.round(processData / 1024 / 1024 * 100) / 100;
    }
}