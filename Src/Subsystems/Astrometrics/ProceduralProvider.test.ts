// -- Procedural Sensor Readings Tests --
// The contract is determinism: the same sector must read the same forever, and
// different sectors must not read alike. Everything else is flavour.

import { describe, it, expect } from 'vitest';

import { readSector } from './ProceduralProvider.js';
import { SOL, SECTOR_SIZE_LY, sectorAddress } from '../Ship/Ship_Navigation.js';

function readAt( position: { x: number, y: number, z: number } ) {
  return readSector( sectorAddress( position ), position );
}

describe( 'readSector', () => {
  it( 'gives the same sector the same readings every time', () => {
    const first = readAt( SOL );
    const second = readAt( SOL );

    expect( first ).toEqual( second );
  } );

  it( 'reads the same anywhere inside one sector', () => {
    // Position within the sector must not matter - the readings describe the
    // volume, and drifting across a sector would look like sensor noise.
    const corner = readAt( SOL );
    const elsewhere = readAt( { x: SOL.x + 19, y: 19, z: 19 } );

    expect( elsewhere ).toEqual( corner );
  } );

  it( 'reads differently in a neighbouring sector', () => {
    const here = readAt( SOL );
    const next = readAt( { x: SOL.x + SECTOR_SIZE_LY, y: 0, z: 0 } );

    expect( next ).not.toEqual( here );
  } );

  it( 'does not collide on transposed sector indices', () => {
    // A naive hash would give (1,2,3) and (3,2,1) the same seed.
    const a = readAt( { x: SOL.x + 20, y: 40, z: 60 } );
    const b = readAt( { x: SOL.x + 60, y: 40, z: 20 } );

    expect( a ).not.toEqual( b );
  } );

  it( 'produces distinct readings across a spread of sectors', () => {
    const seen = new Set<string>();

    for ( let i = 0; i < 60; i++ ) {
      seen.add( JSON.stringify( readAt( { x: SOL.x + i * SECTOR_SIZE_LY, y: 0, z: 0 } ) ) );
    }

    // Some collisions are expected from a small set of discrete fields; a
    // hash that had stopped mixing would collapse far harder than this.
    expect( seen.size ).toBeGreaterThan( 45 );
  } );

  it( 'keeps every reading inside a plausible range', () => {
    for ( let i = -40; i <= 40; i += 3 ) {
      const readings = readAt( {
        x: SOL.x + i * SECTOR_SIZE_LY,
        y: i * SECTOR_SIZE_LY,
        z: i * 4
      } );

      expect( readings.starCount ).toBeGreaterThanOrEqual( 0 );
      expect( readings.particleDensityPerCm3 ).toBeGreaterThan( 0 );
      expect( readings.backgroundRadiationMrem ).toBeGreaterThan( 0 );
      expect( readings.stellarDensity ).toBeTruthy();
      expect( readings.subspaceConditions ).toBeTruthy();
      expect( 'OBAFGKM' ).toContain( readings.dominantSpectralClass );
    }
  } );

  it( 'reports a Sol-like sector at a plausible star count', () => {
    // Canon puts about forty stars in a typical Federation sector.
    const readings = readAt( SOL );

    expect( readings.starCount ).toBeGreaterThan( 10 );
    expect( readings.starCount ).toBeLessThan( 120 );
  } );

  it( 'thickens toward the core and thins toward the rim', () => {
    const inner = readAt( { x: 5000, y: 0, z: 0 } );
    const solar = readAt( SOL );
    const outer = readAt( { x: 60000, y: 0, z: 0 } );

    expect( inner.starCount ).toBeGreaterThan( solar.starCount );
    expect( outer.starCount ).toBeLessThan( solar.starCount );
  } );

  it( 'favours the common spectral classes, as the real mass function does', () => {
    const classes = new Map<string, number>();

    for ( let i = 0; i < 400; i++ ) {
      const c = readAt( { x: SOL.x + i * SECTOR_SIZE_LY, y: 0, z: 0 } ).dominantSpectralClass;
      classes.set( c, ( classes.get( c ) ?? 0 ) + 1 );
    }

    // M dwarfs dominate the galaxy; O stars are vanishingly rare.
    expect( classes.get( 'M' ) ?? 0 ).toBeGreaterThan( 200 );
    expect( classes.get( 'O' ) ?? 0 ).toBeLessThan( 5 );
  } );

  it( 'reports an anomaly in some sectors and not others', () => {
    let withPhenomenon = 0;

    for ( let i = 0; i < 200; i++ ) {
      if ( readAt( { x: SOL.x + i * SECTOR_SIZE_LY, y: 0, z: 0 } ).phenomenon != null ) {
        withPhenomenon++;
      }
    }

    expect( withPhenomenon ).toBeGreaterThan( 20 );
    expect( withPhenomenon ).toBeLessThan( 180 );
  } );
} );
