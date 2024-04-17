// Imports

// Format nice duration times
export function convertDuration ( time: number ): string {
  if ( time === 0 ) {
    return 'Livestream';
  }
  else if ( time < 3600 ) {
    return new Date( time * 1000 ).toISOString().substring( 14, 5 );
  }
  else {
    return new Date( time * 1000 ).toISOString().substring( 11, 8 );
  }
}
