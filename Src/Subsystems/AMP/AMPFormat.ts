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

/**
 * Icon for an *application* state.
 *
 * Stopped and Sleeping are blue rather than black: they describe a game server
 * that is not running inside an instance that is. That is a different situation
 * from the instance being switched off entirely, which instanceState() renders
 * black, and the two must not look alike — one is a click away from serving
 * players, the other needs the machine brought up first.
 */
export function stateEmoji( state: AMPState ): string {
  if ( state === 20 ) return '🟢';
  if ( state === 0 || state === 50 ) return '🔵';
  if ( state === 100 || state === 200 ) return '🔴';
  if ( isTransitional( state ) || state === 60 || state === 80 || state === 250 ) return '🟡';
  return '⚪';
}

export function stateColour( state: AMPState ): number {
  if ( state === 20 ) return 0x00FF00;
  if ( state === 0 || state === 50 ) return 0x3498DB;
  if ( state === 100 || state === 200 ) return 0xFF0000;
  if ( isTransitional( state ) || state === 60 || state === 80 || state === 250 ) return 0xFFA500;
  return 0x5865F2;
}

/** How an instance should be presented in a list or a picker. */
export interface AMPStateView {
  label: string;
  emoji: string;
  colour: number;
}

/**
 * Describe an instance from its `Running` flag and `AppState` together.
 *
 * These are two different things and only reading the second is misleading.
 * `AppState` is the state of the *application inside* an instance; it is only
 * meaningful while that instance's daemon is up. AMP reports `-1` (Undefined)
 * for every instance with `Running: false`, because it genuinely has nothing to
 * say about an application that is not there to be asked.
 *
 * Rendering that literally makes every powered-off game server read as
 * "Undefined". `Running` is the field that actually answers "is this thing on",
 * so it is checked first.
 */
export function instanceState( running: boolean, appState: AMPState ): AMPStateView {
  if ( !running ) {
    return { label: 'Offline', emoji: '⚫', colour: 0x808080 };
  }

  // Daemon up but no application state reported yet. This is the window right
  // after an instance comes online, before the controller has re-polled it —
  // and the controller's aggregate is slow (see the note on listInstances), so
  // the window is tens of seconds wide, not milliseconds. "Undefined" is a
  // terrible thing to show an operator who just started something.
  if ( appState === -1 ) {
    return { label: 'Initialising', emoji: '🟡', colour: 0xFFA500 };
  }

  return {
    label: stateLabel( appState ),
    emoji: stateEmoji( appState ),
    colour: stateColour( appState )
  };
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
 * Render AMP's uptime string.
 *
 * AMP is inconsistent about the format: `hh:mm:ss` for short uptimes, but
 * `d:hh:mm:ss` once days are involved — confirmed against the live controller,
 * which reported `0:10:29:25` for a server up ten and a half hours. The .NET
 * TimeSpan spelling `d.hh:mm:ss` is handled too, since AMP's own SDKs document
 * that one. All three are normalised before parsing rather than pattern-matched
 * individually.
 *
 * A stopped instance reports all zeroes, which is noise rather than data.
 */
export function formatUptime( raw: string | undefined ): string {
  if ( raw == null ) return '—';

  const trimmed = raw.trim();
  if ( trimmed === '' ) return '—';

  // Drop fractional seconds first so the day separator normalisation below
  // cannot mistake them for a day component.
  const parts = trimmed
    .replace( /\.\d+$/, '' )
    .replace( '.', ':' )
    .split( ':' )
    .map( Number );

  if ( parts.length < 3 || parts.length > 4 || parts.some( Number.isNaN ) ) return trimmed;

  const [days, hours, minutes] = parts.length === 4
    ? [parts[0], parts[1], parts[2]]
    : [0, parts[0], parts[1]];
  const seconds = parts[parts.length - 1];

  if ( days === 0 && hours === 0 && minutes === 0 && seconds === 0 ) return '—';

  const out: string[] = [];
  if ( days > 0 ) out.push( `${ days }d` );
  if ( hours > 0 ) out.push( `${ hours }h` );
  if ( minutes > 0 ) out.push( `${ minutes }m` );

  return out.length > 0 ? out.join( ' ' ) : '< 1m';
}

export default {
  AMP_STATE_NAMES,
  stateLabel,
  stateEmoji,
  stateColour,
  isTransitional,
  instanceState,
  formatMetric,
  formatUptime
};
