// -- Ship Flavour and Formatting Tests --

import { describe, it, expect } from 'vitest';

import {
  absoluteTimestamp,
  formatCoordinates,
  formatCourse,
  formatDuration,
  formatGalacticPlane,
  formatSector,
  formatWarp,
  getArrivalMessage,
  getDepartureMessage,
  getSpeedChangeMessage,
  getUnderwayRefusal,
  progressBar,
  relativeTimestamp,
  statusIcon,
  statusLabel,
  velocityLabel,
  velocityNote
} from './Ship_Messages.js';
import {
  SOL,
  WARP_DEFAULT,
  WARP_MAX_CRUISE,
  WARP_MAX_RATED,
  WARP_OPEN_MAX,
  sectorAddress
} from './Ship_Navigation.js';

describe( 'formatCourse', () => {
  it( 'zero-pads the azimuth to three digits, canon style', () => {
    expect( formatCourse( 0, 0 ) ).toBe( '000 mark 0' );
    expect( formatCourse( 45, 12 ) ).toBe( '045 mark 12' );
    expect( formatCourse( 285, 15 ) ).toBe( '285 mark 15' );
  } );

  it( 'rounds rather than printing a wall of decimals', () => {
    expect( formatCourse( 44.7, 11.4 ) ).toBe( '045 mark 11' );
  } );
} );

describe( 'formatWarp', () => {
  it( 'trims trailing zeroes', () => {
    expect( formatWarp( 6 ) ).toBe( 'warp 6' );
    expect( formatWarp( 9.2 ) ).toBe( 'warp 9.2' );
    expect( formatWarp( 9.6 ) ).toBe( 'warp 9.6' );
  } );
} );

describe( 'formatCoordinates', () => {
  it( 'renders a triple to two decimals', () => {
    expect( formatCoordinates( SOL ) ).toBe( '30000.00, 0.00, 0.00' );
  } );

  it( 'never renders a negative zero', () => {
    expect( formatCoordinates( { x: -0, y: -0, z: -0 } ) ).toBe( '0.00, 0.00, 0.00' );
  } );
} );

describe( 'formatSector', () => {
  it( 'reads as designation then quadrant', () => {
    expect( formatSector( sectorAddress( SOL ) ) ).toBe( 'Sector 001 · Alpha Quadrant' );
  } );
} );

describe( 'formatDuration', () => {
  it( 'drops units that are zero', () => {
    expect( formatDuration( 90 * 60_000 ) ).toBe( '1h 30m' );
    expect( formatDuration( 2 * 86_400_000 ) ).toBe( '2d' );
    expect( formatDuration( 45 * 60_000 ) ).toBe( '45m' );
  } );

  it( 'combines days, hours and minutes', () => {
    expect( formatDuration( ( 2 * 1440 + 3 * 60 + 4 ) * 60_000 ) ).toBe( '2d 3h 4m' );
  } );

  it( 'does not report a zero-minute duration', () => {
    expect( formatDuration( 0 ) ).toBe( 'less than a minute' );
    expect( formatDuration( 30_000 ) ).toBe( 'less than a minute' );
  } );

  it( 'refuses to guess at nonsense', () => {
    expect( formatDuration( NaN ) ).toBe( 'unknown' );
    expect( formatDuration( -1 ) ).toBe( 'unknown' );
  } );
} );

describe( 'progressBar', () => {
  it( 'fills proportionally and reports a percentage', () => {
    expect( progressBar( 0 ) ).toBe( `${ '░'.repeat( 20 ) } 0%` );
    expect( progressBar( 1 ) ).toBe( `${ '█'.repeat( 20 ) } 100%` );
    expect( progressBar( 0.5 ) ).toContain( '50%' );
  } );

  it( 'always renders exactly twenty cells', () => {
    for ( const p of [0, 0.13, 0.5, 0.99, 1, 5, -3, NaN] ) {
      const cells = progressBar( p ).split( ' ' )[0];
      expect( cells ).toHaveLength( 20 );
    }
  } );

  it( 'clamps rather than overflowing', () => {
    expect( progressBar( 5 ) ).toContain( '100%' );
    expect( progressBar( -1 ) ).toContain( '0%' );
    expect( progressBar( NaN ) ).toContain( '0%' );
  } );
} );

describe( 'timestamps', () => {
  const at = new Date( Date.UTC( 2026, 7, 1, 12, 0, 0 ) );

  it( 'emits Discord relative and absolute markup', () => {
    expect( relativeTimestamp( at ) ).toBe( `<t:${ at.getTime() / 1000 }:R>` );
    expect( absoluteTimestamp( at ) ).toBe( `<t:${ at.getTime() / 1000 }:f>` );
  } );
} );

describe( 'formatGalacticPlane', () => {
  it( 'says which side of the plane the ship is on', () => {
    expect( formatGalacticPlane( 4.2 ) ).toBe( '4.20 ly above the galactic plane' );
    expect( formatGalacticPlane( -4.2 ) ).toBe( '4.20 ly below the galactic plane' );
  } );

  it( 'treats a negligible offset as being in the plane', () => {
    expect( formatGalacticPlane( 0 ) ).toBe( 'in the galactic plane' );
    expect( formatGalacticPlane( -0.0001 ) ).toBe( 'in the galactic plane' );
  } );
} );

describe( 'velocityLabel', () => {
  it( 'names the Technical Manual bands', () => {
    expect( velocityLabel( WARP_DEFAULT ) ).toBe( 'Normal cruise' );
    expect( velocityLabel( 3 ) ).toBe( 'Sustained cruise' );
    expect( velocityLabel( 8 ) ).toBe( 'Above normal cruise' );
    expect( velocityLabel( WARP_MAX_RATED ) ).toBe( 'High warp' );
  } );
} );

describe( 'velocityNote', () => {
  it( 'says nothing at or below normal cruise', () => {
    expect( velocityNote( WARP_DEFAULT ) ).toBeNull();
    expect( velocityNote( 2 ) ).toBeNull();
  } );

  it( 'mentions two deflector generators above warp 8', () => {
    expect( velocityNote( 8.5 ) ).toContain( 'Two deflector generators' );
  } );

  it( 'mentions the structural integrity field above warp 9', () => {
    expect( velocityNote( WARP_OPEN_MAX + 0.1 ) ).toContain( 'Structural integrity field' );
  } );

  it( 'mentions the twelve-hour limit above maximum cruise', () => {
    const note = velocityNote( WARP_MAX_RATED );

    expect( note ).toContain( 'All three deflector generators' );
    expect( note ).toContain( 'twelve hours' );
    expect( note ).toContain( `warp ${ WARP_MAX_CRUISE }` );
  } );
} );

describe( 'status wording', () => {
  it( 'has a label and an icon for every status', () => {
    for ( const status of ['docked', 'orbit', 'idle', 'transit'] as const ) {
      expect( statusLabel( status ) ).toBeTruthy();
      expect( statusIcon( status ) ).toBeTruthy();
    }
  } );
} );

describe( 'flavour lines', () => {
  it( 'always returns something to say', () => {
    for ( let i = 0; i < 50; i++ ) {
      expect( getDepartureMessage() ).toBeTruthy();
      expect( getArrivalMessage() ).toBeTruthy();
      expect( getUnderwayRefusal() ).toBeTruthy();
    }
  } );

  it( 'distinguishes accelerating from decelerating', () => {
    const faster = new Set<string>();
    const slower = new Set<string>();

    for ( let i = 0; i < 200; i++ ) {
      faster.add( getSpeedChangeMessage( 6, 9 ) );
      slower.add( getSpeedChangeMessage( 9, 6 ) );
    }

    expect( faster.size ).toBeGreaterThan( 1 );
    expect( slower.size ).toBeGreaterThan( 1 );
    for ( const line of faster ) expect( slower.has( line ) ).toBe( false );
  } );
} );
