// Imports

// Format nice duration times
export function convertDuration ( time: number ): string {
  if ( time === 0 ) {
    return 'Livestream';
  }
  else if ( time < 3600 ) {
    return new Date( time / 60 ).toISOString().substring( 14, 5 );
  }
  else {
    return new Date( time * 1000 ).toISOString().substring( 11, 8 );
  }
}

export function convertSecondsToHMS ( seconds: number ): string {
  const hours = Math.floor( seconds / 3600 );
  const minutes = Math.floor( ( seconds % 3600 ) / 60 );
  const remainingSeconds = seconds % 60;

  let timeString = '';

  if ( hours > 0 ) {
    timeString += `${hours}:`;
  }

  if ( minutes > 0 || hours > 0 ) {
    // Only pad minutes with leading zero if there are preceding hours
    timeString += ( hours > 0 ) ? String( minutes ).padStart( 2, '0' ) : String( minutes );
    timeString += ':';
  }

  if ( remainingSeconds > 0 || timeString.endsWith( ':' ) ) {
    // Only pad seconds with leading zero if there are preceding minutes or hours
    timeString += ( timeString !== '' ) ? String( remainingSeconds ).padStart( 2, '0' ) : String( remainingSeconds );

    if ( timeString === String( remainingSeconds ) ) {
      timeString += 's';
    }
  }
  else if ( timeString === '' ) {
    // If all values are 0, return "0"
    timeString = '0';
  }

  return timeString;
}
