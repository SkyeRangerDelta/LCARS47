// -- AMP Audit Trail --
// Records who did what to which game server, in a channel rather than only in
// the container's console.
//
// On a shared server "who stopped Valheim?" is a real question, and console
// logs are not somewhere the people asking it can look. Control actions are
// rare and consequential, so a durable record is cheap and worth having.
//
// This is the Discord-facing edge of the AMP subsystem. AMPClient itself stays
// free of Discord types; only this module knows about channels and embeds.

import { EmbedBuilder, type TextChannel } from 'discord.js';

import Utility from '../Utilities/SysUtils.js';
import { getEnv } from '../Utilities/EnvUtils.js';
import type { LCARSClient } from '../Auxiliary/LCARSClient.js';

/** Which of AMP's two layers the action targeted. */
export type AMPAuditLayer = 'instance' | 'server';

/**
 * What became of the action.
 *
 * `pending` is deliberately distinct from `completed`: a server that is still
 * starting when the poll budget runs out has neither succeeded nor failed, and
 * an audit trail that flattened the two would be lying in one direction or the
 * other.
 */
export type AMPAuditOutcome = 'denied' | 'completed' | 'failed' | 'pending';

export interface AMPAuditEntry {
  layer: AMPAuditLayer;
  action: 'start' | 'stop';
  /** Friendly name where known, otherwise whatever the operator typed. */
  target: string;
  operator: string;
  /** Kept for the console log line only — deliberately not shown in the embed. */
  operatorId: string;
  outcome: AMPAuditOutcome;
  detail?: string;
}

const OUTCOME_COLOUR: Readonly<Record<AMPAuditOutcome, number>> = {
  denied: 0x808080,
  completed: 0x00FF00,
  failed: 0xFF0000,
  pending: 0xFFA500
};

const OUTCOME_LABEL: Readonly<Record<AMPAuditOutcome, string>> = {
  denied: 'Denied',
  completed: 'Completed',
  failed: 'Failed',
  pending: 'Still in progress'
};

/** Memoised so the audit path does not re-fetch the channel every action. */
let auditChannel: TextChannel | null = null;

/** Build the audit embed. Exported so the layout can be unit tested. */
export function buildAuditEmbed( entry: AMPAuditEntry ): EmbedBuilder {
  const layer = entry.layer === 'instance' ? 'Instance' : 'Game server';
  const action = entry.action === 'start' ? 'start' : 'stop';

  const embed = new EmbedBuilder()
    .setTitle( `⚙️ ${ layer } ${ action } — ${ entry.target }` )
    .setColor( OUTCOME_COLOUR[entry.outcome] )
    .addFields(
      { name: 'Operator', value: entry.operator, inline: true },
      { name: 'Outcome', value: OUTCOME_LABEL[entry.outcome], inline: true }
    )
    .setFooter( { text: `AMP Audit • Stardate ${ Utility.stardate() }` } )
    .setTimestamp();

  if ( entry.detail != null && entry.detail !== '' ) {
    embed.setDescription( entry.detail );
  }

  return embed;
}

/**
 * Post an audit record. Never throws — an audit trail that can take a command
 * down with it is worse than no audit trail.
 */
export async function recordAMPAction( client: LCARSClient, entry: AMPAuditEntry ): Promise<void> {
  Utility.log( 'proc',
    `[AMP-AUDIT] ${ entry.layer } ${ entry.action } on ${ entry.target }`
    + ` by ${ entry.operator } (${ entry.operatorId }) -> ${ entry.outcome }` );

  try {
    const channel = await getAuditChannel( client );
    if ( channel == null ) return;

    await channel.send( { embeds: [buildAuditEmbed( entry )] } );
  }
  catch ( err ) {
    Utility.log( 'warn', `[AMP-AUDIT] Could not post audit record: ${ String( err ) }` );
  }
}

async function getAuditChannel( client: LCARSClient ): Promise<TextChannel | null> {
  if ( auditChannel != null ) return auditChannel;

  const env = getEnv();
  const channelId = env.AMP_AUDIT_CHANNEL ?? env.ENGINEERING;

  try {
    const channel = await client.PLDYN.channels.fetch( channelId );
    if ( channel?.isTextBased() ) {
      auditChannel = channel as TextChannel;
      return auditChannel;
    }
  }
  catch ( err ) {
    Utility.log( 'warn', `[AMP-AUDIT] Could not fetch audit channel: ${ String( err ) }` );
  }

  return null;
}

export default { recordAMPAction, buildAuditEmbed };
