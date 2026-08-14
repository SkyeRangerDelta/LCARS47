// -- AMP Formatting --
// Pure presentation helpers for the AMP integration. No I/O, no client state —
// everything here is a total function of its arguments so it can be unit
// tested without mocking anything.

import type { AMPMetric, AMPState } from './AMPInterfaces.js';

/**
 * AMP's application state enum. Sparse by design — these are the exact values
 * AMP emits, confirmed against the live controller's API spec.
 */
export const AMP_STATE_NAMES: Readonly<Record<number, string>> = {
  [-1]: 'Undefined',
  0: 'Stopped',
  5: 'Pre-Start',
  7: 'Configuring',
  10: 'Starting',
  20: 'Ready',
  30: 'Restarting',
  40: 'Stopping',
  45: 'Preparing For Sleep',
  50: 'Sleeping',
  60: 'Waiting',
  70: 'Installing',
  75: 'Updating',
  80: 'Awaiting User Input',
  100: 'Failed',
  200: 'Suspended',
  250: 'Maintenance',
  999: 'Indeterminate'
};

/** States that mean "mid-transition" — worth continuing to poll. */
const TRANSITIONAL = new Set( [5, 7, 10, 30, 40, 45, 70, 75] );

export function stateLabel( state: AMPState ): string {
  return AMP_STATE_NAMES[state] ?? `Unknown (${ state })`;
}

export function isTransitional( state: AMPState ): boolean {
  return TRANSITIONAL.has( state );
}

export function stateEmoji( state: AMPState ): string {
  if ( state === 20 ) return '🟢';
  if ( state === 0 || state === 50 ) return '⚫';
  if ( state === 100 || state === 200 ) return '🔴';
  if ( isTransitional( state ) || state === 60 || state === 80 || state === 250 ) return '🟡';
  return '⚪';
}

export function stateColour( state: AMPState ): number {
  if ( state === 20 ) return 0x00FF00;
  if ( state === 0 || state === 50 ) return 0x808080;
  if ( state === 100 || state === 200 ) return 0xFF0000;
  if ( isTransitional( state ) || state === 60 || state === 80 || state === 250 ) return 0xFFA500;
  return 0x5865F2;
}

/**
 * Render one metric for an embed field.
 *
 * AMP modules publish arbitrary metric dictionaries, so this must degrade
 * gracefully for names it has never seen — the name is only used to decide
 * whether a bare percentage reads better than a ratio.
 */
export function formatMetric( name: string, metric: AMPMetric ): string {
  const percent = `${ Math.round( metric.percent ) }%`;

  // Pure percentage metrics (CPU Usage) carry a meaningless MaxValue of 100.
  if ( metric.units === '%' ) {
    return percent;
  }

  // Memory-style metrics read better in GB once they run to four digits.
  if ( /^mi?b$/i.test( metric.units ) && metric.maxValue >= 1024 ) {
    return `${ ( metric.rawValue / 1024 ).toFixed( 1 ) } / ${ ( metric.maxValue / 1024 ).toFixed( 1 ) } GB (${ percent })`;
  }

  const unit = metric.units === '' ? '' : ` ${ metric.units }`;

  if ( metric.maxValue > 0 ) {
    return `${ metric.rawValue }${ unit } / ${ metric.maxValue }${ unit } (${ percent })`;
  }

  return `${ metric.rawValue }${ unit }`;
}

/**
 * AMP reports uptime as a .NET TimeSpan string — `hh:mm:ss` or `d.hh:mm:ss`.
 * A stopped instance reports `00:00:00`, which is noise rather than data.
 */
export function formatUptime( raw: string | undefined ): string {
  if ( raw == null ) return '—';

  const trimmed = raw.trim();
  if ( trimmed === '' || /^0+(\.0+)?:0+:0+(\.\d+)?$/.test( trimmed ) ) return '—';

  const match = /^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec( trimmed );
  if ( match == null ) return trimmed;

  const days = Number( match[1] ?? 0 );
  const hours = Number( match[2] );
  const minutes = Number( match[3] );

  const parts: string[] = [];
  if ( days > 0 ) parts.push( `${ days }d` );
  if ( hours > 0 ) parts.push( `${ hours }h` );
  if ( minutes > 0 ) parts.push( `${ minutes }m` );

  return parts.length > 0 ? parts.join( ' ' ) : '< 1m';
}

export default {
  AMP_STATE_NAMES,
  stateLabel,
  stateEmoji,
  stateColour,
  isTransitional,
  formatMetric,
  formatUptime
};
