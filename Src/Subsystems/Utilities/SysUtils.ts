// -- System Utilities --
// LCARS Date/Time and low-priority system functions

// Imports
import colors from 'colors';
import { DateTime, type Duration } from 'luxon';
import { execSync } from 'child_process';

// Exports
export default {
  log ( level: string, data: string ): void {
    switch ( level ) {
      case 'proc':
        console.log( colors.green( data ) );
        break;
      case 'info':
        console.info( data );
        break;
      case 'warn':
        console.warn( colors.yellow( data ) );
        break;
      case 'err':
        console.error( colors.red( data) );
    }
  },
  flexTime ( date?: Date ): string {
    let newFlex: string;
    if ( date == null ) {
      newFlex = DateTime.now().setZone( 'UTC-5' ).toLocaleString( DateTime.DATETIME_MED );
    }
    else {
      newFlex = DateTime.fromJSDate( date ).toLocaleString( DateTime.DATETIME_MED );
    }

    return newFlex;
  },
  stardate(date?: Date): string {
    const dt = date
      ? DateTime.fromJSDate(date).setZone('UTC-5')
      : DateTime.now().setZone('UTC-5');
    const base = dt.toFormat('Ldyy');
    const secondsInDay = 24 * 60 * 60;
    const currentSeconds =
      dt.hour * 3600 + dt.minute * 60 + dt.second;
    const tenth = Math.floor((currentSeconds / secondsInDay) * 10);
    return `${base}.${tenth}`;
  },
  shipboardTime() {
    return DateTime.now().toFormat('HH:mm:ss');
  },
  formatMSDiff ( ms: number ): Duration {
    const date = new Date( ms );
    let impDate = DateTime.fromISO( date.toISOString() );
    impDate = impDate.setZone( 'UTC-5' );
    const now = DateTime.now().setZone( 'UTC-5' );

    const diff = now.diff( impDate, ['years', 'months', 'days', 'hours', 'minutes', 'seconds'] );

    return diff;
  },
  formatProcess_mem ( processData: number ): number {
    return Math.round( processData / 1024 / 1024 * 100 ) / 100;
  },
  getVersion(): string {
    return execSync( 'git describe --tags --abbrev=0', { encoding: 'utf8' } ).trim();
  }
};
