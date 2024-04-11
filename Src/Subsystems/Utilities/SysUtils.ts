// -- System Utilities --
// LCARS Date/Time and low-priority system functions

// Imports
import colors from 'colors';
import { DateTime, Duration } from 'luxon';

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
        console.error( colors.red( data ) );
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
  stardate ( date?: Date ): string {
    let newStardate: string;
    if ( date == null ) {
      newStardate = DateTime.now().setZone( 'UTC-5' ).toFormat( 'LdyyHm.s' );
    }
    else {
      newStardate = DateTime.fromJSDate( date ).toFormat( 'LdyyHm.s' );
    }

    return newStardate;
  },
  formatMSDiff ( ms: number, obj?: boolean ): Duration {
    const date = new Date( ms );
    let impDate = DateTime.fromISO( date.toISOString() );
    impDate = impDate.setZone( 'UTC-5' );
    const now = DateTime.now().setZone( 'UTC-5' );

    const diff = now.diff( impDate, ['years', 'months', 'days', 'hours', 'minutes', 'seconds'] );

    return diff;
  },
  formatProcess_mem ( processData: number ): number {
    return Math.round( processData / 1024 / 1024 * 100 ) / 100;
  }
};
