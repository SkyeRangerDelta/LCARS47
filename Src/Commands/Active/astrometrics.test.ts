// -- Astrometrics Command Tests --
// Embed layout only. What matters most here is provenance: the report must not
// present generated readings as if they were measurements.

import { describe, it, expect } from 'vitest';
import type { EmbedBuilder } from 'discord.js';

import { buildReportEmbed, buildScanEmbed } from './astrometrics.js';
import { SOL, projectCourse } from '../../Subsystems/Ship/Ship_Navigation.js';
import { resolveShipPosition } from '../../Subsystems/Ship/Ship_Utilities.js';
import { readSector } from '../../Subsystems/Astrometrics/ProceduralProvider.js';
import type {
  AstrometricsReport,
  ScanResult,
  StellarNeighbour
} from '../../Subsystems/Astrometrics/AstroInterfaces.js';
import type { ShipPosition } from '../../Subsystems/Auxiliary/Interfaces/ShipInterfaces.js';

const fieldValue = ( embed: EmbedBuilder, name: string ): string | undefined =>
  embed.data.fields?.find( f => f.name === name )?.value;

function positionAt( position = { ...SOL } ) {
  const doc: ShipPosition = {
    id: 1,
    status: 'orbit',
    position,
    anchorage: 'Earth',
    updatedAt: new Date( Date.UTC( 2026, 7, 1 ) ),
    updatedBy: 'system'
  };

  return resolveShipPosition( doc, Date.UTC( 2026, 7, 1 ) );
}

const PROXIMA: StellarNeighbour = {
  name: 'Proxima Centauri',
  position: projectCourse( SOL, 90, 10, 4.25 ),
  distanceLy: 4.25,
  bearing: 314,
  mark: 358,
  spectralType: 'M5.5Ve',
  objectType: 'PM*',
  source: 'simbad'
};

function report( over: Partial<AstrometricsReport> = {} ): AstrometricsReport {
  const position = over.position ?? positionAt();

  return {
    position,
    readings: readSector( position.sector, position.position ),
    neighbours: [PROXIMA],
    catalogueNote: null,
    ...over
  };
}

describe( 'buildReportEmbed', () => {
  it( 'leads with position, sector and quadrant', () => {
    const embed = buildReportEmbed( report() );

    expect( embed.data.title ).toBe( '🔭 Astrometrics Report' );
    expect( fieldValue( embed, 'Position' ) ).toBe( 'Sector 001 · Alpha Quadrant' );
    expect( fieldValue( embed, 'Sol' ) ).toBe( '0.00 ly' );
    expect( fieldValue( embed, 'Galactic centre' ) ).toBe( '30000.0 ly' );
  } );

  it( 'lists catalogued objects with range and bearing', () => {
    const embed = buildReportEmbed( report() );

    expect( embed.data.description ).toContain( 'Proxima Centauri' );
    expect( embed.data.description ).toContain( '4.25 ly' );
    expect( embed.data.description ).toContain( '314 mark 358' );
    expect( embed.data.description ).toContain( 'M5.5Ve' );
  } );

  it( 'says the readings are computed rather than measured', () => {
    // The report mixes measured catalogue positions with generated sensor
    // readings. Presenting the second as the first would be the easy mistake.
    const embed = buildReportEmbed( report() );

    expect( embed.data.footer?.text ).toContain( 'computed' );
  } );

  it( 'renders the sensor readings', () => {
    const embed = buildReportEmbed( report() );

    expect( fieldValue( embed, 'Stellar density' ) ).toContain( 'stars in sector' );
    expect( fieldValue( embed, 'Particle density' ) ).toContain( '/cm³' );
    expect( fieldValue( embed, 'Background radiation' ) ).toContain( 'mrem/h' );
    expect( fieldValue( embed, 'Subspace' ) ).toBeTruthy();
  } );

  it( 'shows an anomaly only when the sector has one', () => {
    const base = report();
    const withAnomaly = buildReportEmbed( {
      ...base,
      readings: { ...base.readings, phenomenon: 'Cold molecular cloud.' }
    } );
    const without = buildReportEmbed( {
      ...base,
      readings: { ...base.readings, phenomenon: null }
    } );

    expect( fieldValue( withAnomaly, 'Anomaly' ) ).toBe( 'Cold molecular cloud.' );
    expect( fieldValue( without, 'Anomaly' ) ).toBeUndefined();
  } );

  it( 'surfaces a sensor note when the catalogue could not answer', () => {
    const embed = buildReportEmbed( report( {
      neighbours: [],
      catalogueNote: 'Beyond charted space.'
    } ) );

    expect( fieldValue( embed, 'Sensor note' ) ).toBe( 'Beyond charted space.' );
    expect( embed.data.description ).toBeUndefined();
  } );

  it( 'stays within the embed field limit', () => {
    const embed = buildReportEmbed( report( { catalogueNote: 'note' } ) );

    expect( embed.data.fields?.length ?? 0 ).toBeLessThanOrEqual( 25 );
  } );

  it( 'keeps the object list inside the description limit', () => {
    const many = Array.from( { length: 200 }, ( _, i ) => ( {
      ...PROXIMA,
      name: `Very Long Catalogue Designation Number ${ i } ${ 'x'.repeat( 60 ) }`
    } ) );

    const embed = buildReportEmbed( report( { neighbours: many } ) );

    expect( ( embed.data.description ?? '' ).length ).toBeLessThanOrEqual( 4000 );
  } );
} );

describe( 'buildScanEmbed', () => {
  const canon: ScanResult['canon'] = {
    uid: 'ASMA0000115323',
    name: 'Vulcan',
    objectType: 'M_CLASS_PLANET',
    location: { uid: 'ASMA0000001073', name: '40 Eridani A' }
  };

  const fix: StellarNeighbour = {
    ...PROXIMA,
    name: 'omi02 Eri',
    distanceLy: 16.34,
    bearing: 201,
    mark: 322,
    spectralType: 'K0V'
  };

  it( 'reports canon identity and a stellar fix together', () => {
    const embed = buildScanEmbed( {
      query: 'Vulcan', canon, fix, note: 'Canon record and stellar fix.'
    } );

    expect( embed.data.title ).toContain( 'Vulcan' );
    expect( fieldValue( embed, 'Designation' ) ).toBe( 'Vulcan' );
    expect( fieldValue( embed, 'Classification' ) ).toBe( 'M-class planet' );
    expect( fieldValue( embed, 'Within' ) ).toBe( '40 Eridani A' );
    expect( fieldValue( embed, 'Range' ) ).toBe( '16.34 ly' );
    expect( fieldValue( embed, 'Bearing' ) ).toBe( '201 mark 322' );
    expect( fieldValue( embed, 'Catalogue fix' ) ).toContain( 'omi02 Eri' );
  } );

  it( 'reports canon identity alone when there is no fix', () => {
    const embed = buildScanEmbed( {
      query: 'Bajor', canon, fix: null, note: 'No navigational fix available.'
    } );

    expect( fieldValue( embed, 'Designation' ) ).toBe( 'Vulcan' );
    expect( fieldValue( embed, 'Range' ) ).toBeUndefined();
    expect( embed.data.description ).toContain( 'No navigational fix' );
  } );

  it( 'reports a fix alone when there is no canon record', () => {
    const embed = buildScanEmbed( {
      query: 'Vega', canon: null, fix, note: 'Stellar catalogue fix.'
    } );

    expect( fieldValue( embed, 'Designation' ) ).toBeUndefined();
    expect( fieldValue( embed, 'Range' ) ).toBe( '16.34 ly' );
  } );

  it( 'greys out a scan that found nothing', () => {
    const found = buildScanEmbed( { query: 'Vulcan', canon, fix, note: null } );
    const empty = buildScanEmbed( {
      query: 'Qapla', canon: null, fix: null, note: 'No record.'
    } );

    expect( empty.data.color ).not.toBe( found.data.color );
    expect( empty.data.fields ?? [] ).toHaveLength( 0 );
  } );

  it( 'copes with an unclassified record', () => {
    const embed = buildScanEmbed( {
      query: 'x',
      canon: { uid: 'u', name: 'Something', objectType: null, location: null },
      fix: null,
      note: null
    } );

    expect( fieldValue( embed, 'Classification' ) ).toBe( 'Unclassified' );
    expect( fieldValue( embed, 'Within' ) ).toBeUndefined();
  } );

  it( 'truncates an absurd query rather than exceeding the title limit', () => {
    const embed = buildScanEmbed( {
      query: 'x'.repeat( 500 ), canon: null, fix: null, note: null
    } );

    expect( ( embed.data.title ?? '' ).length ).toBeLessThanOrEqual( 256 );
  } );
} );
