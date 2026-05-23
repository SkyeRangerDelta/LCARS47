// -- AI Core --
// Handles Computer queries by routing them to Anthropic / Claude.
// Replaces the prior OpenAI-backed OPs_GPTCore.

import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlockParam,
  ImageBlockParam,
  MessageParam,
  TextBlockParam,
  DocumentBlockParam,
  ToolResultBlockParam,
  ToolUseBlock
} from '@anthropic-ai/sdk/resources/messages';
import {
  AttachmentBuilder,
  ChannelType,
  type Attachment,
  type Message,
  type TextChannel
} from 'discord.js';
import { DateTime } from 'luxon';
import { LCARS47 } from './OPs_CoreClient.js';
import Utility from '../Utilities/SysUtils.js';
import { parsePersona, type Persona } from './OPs_AIPersonas.js';
import { tools, dispatchTool, type ToolContext } from './OPs_AITools.js';

const SONNET_MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_ITERATIONS = 5;
const MAX_DOC_BYTES = 500 * 1024;
const HISTORY_LIMIT = 40;
const HISTORY_LOOKBACK_HOURS = 1;

const anthropic = new Anthropic( {
  apiKey: process.env.ANTHROPIC_API_KEY
} );

const IMAGE_MIMES = new Set( ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] );
const TEXT_DOC_EXTS = new Set( ['.txt', '.log', '.md', '.json', '.csv', '.yaml', '.yml', '.xml', '.ini', '.conf'] );
const PDF_MIMES = new Set( ['application/pdf'] );

export default {
  async handleAIReq ( msg: Message, content: string, isAdv: boolean ): Promise<unknown> {
    Utility.log( 'proc', '[EVENT] [AI-CORE] Beginning new Claude request.' );

    if ( msg.channel.type !== ChannelType.GuildText ) return;

    await msg.channel.sendTyping();

    const { persona, content: cleaned } = parsePersona( content );
    const stardate = Utility.stardate();

    try {
      const history = await buildHistory( msg );
      const finalUserBlocks = await buildUserContent( cleaned, msg.attachments.values() );
      const messages: MessageParam[] = [...history, { role: 'user', content: finalUserBlocks }];

      const systemBlocks: TextBlockParam[] = [
        {
          type: 'text',
          text: persona.text,
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: `Operational context: stardate ${stardate}. Active persona: ${persona.label}. Requesting user displayName: ${msg.author.displayName}.${persona.signoff != null ? ` Signoff convention: ${persona.signoff.trim()}` : ''}`
        }
      ];

      const reply = await runWithTools( {
        systemBlocks,
        messages,
        persona,
        isAdv,
        toolCtx: { client: LCARS47, guildId: msg.guildId ?? '' }
      } );

      if ( reply == null || reply.trim() === '' ) return await msg.reply( 'LCARS47 produced no response.' );

      await sendReply( msg, reply );
    }
    catch ( err ) {
      const message = ( err as Error ).message ?? '';
      Utility.log( 'err', `[AI-CORE] Request failed: ${message}` );
      console.log( typeof err, err );

      if ( /credit balance is too low/i.test( message ) ) {
        return await msg.reply( 'Dilithium reserves depleted. Cognitive subsystems offline pending resupply.' );
      }

      return await msg.reply( 'No.' );
    }
  }
};

interface RunArgs {
  systemBlocks: TextBlockParam[];
  messages: MessageParam[];
  persona: Persona;
  isAdv: boolean;
  toolCtx: ToolContext;
}

async function runWithTools ( args: RunArgs ): Promise<string> {
  const { systemBlocks, messages, persona, isAdv, toolCtx } = args;

  const baseParams = {
    model: SONNET_MODEL,
    system: systemBlocks,
    tools,
    // Extended thinking requires temperature=1; otherwise use the persona's preferred temperature.
    temperature: isAdv ? 1 : ( persona.temperature ?? 0.3 ),
    max_tokens: isAdv ? 6000 : 2000,
    ...( isAdv ? { thinking: { type: 'enabled' as const, budget_tokens: 4000 } } : {} )
  };

  let iterations = 0;
  let currentMessages = messages;

  while ( iterations < MAX_TOOL_ITERATIONS ) {
    iterations += 1;
    const response = await anthropic.messages.create( {
      ...baseParams,
      messages: currentMessages
    } );

    if ( response.usage.cache_read_input_tokens != null && response.usage.cache_read_input_tokens > 0 ) {
      Utility.log( 'info', `[AI-CORE] Cache hit: ${response.usage.cache_read_input_tokens} tokens read from cache.` );
    }

    if ( response.stop_reason !== 'tool_use' ) {
      return extractText( response.content );
    }

    const toolUses: ToolUseBlock[] = response.content.filter(
      ( b ): b is ToolUseBlock => b.type === 'tool_use'
    );
    if ( toolUses.length === 0 ) return extractText( response.content );

    Utility.log( 'info', `[AI-CORE] Dispatching ${toolUses.length} tool call(s): ${toolUses.map( t => t.name ).join( ', ' )}` );

    const toolResults: ToolResultBlockParam[] = [];
    for ( const t of toolUses ) {
      const out = await dispatchTool( t.name, t.input as Record<string, unknown>, toolCtx );
      toolResults.push( {
        type: 'tool_result',
        tool_use_id: t.id,
        content: out
      } );
    }

    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content as ContentBlockParam[] },
      { role: 'user', content: toolResults }
    ];
  }

  Utility.log( 'warn', '[AI-CORE] Tool-use loop hit iteration cap.' );
  return 'Tool execution did not converge. Try again.';
}

function extractText ( content: readonly ContentBlockParam[] | { type: string; text?: string }[] ): string {
  const parts: string[] = [];
  for ( const block of content as { type: string; text?: string }[] ) {
    if ( block.type === 'text' && block.text != null ) parts.push( block.text );
  }
  return parts.join( '\n' ).trim();
}

async function buildHistory ( msg: Message ): Promise<MessageParam[]> {
  const recentAfter = DateTime.fromJSDate( msg.createdAt ).minus( { hours: HISTORY_LOOKBACK_HOURS } ).toMillis();

  const fetched = await msg.channel.messages.fetch( {
    limit: HISTORY_LIMIT,
    cache: false
  } );
  // Sort ascending and drop the current message (we'll append it as the final user block).
  const sorted = [...fetched.values()]
    .filter( m => m.id !== msg.id )
    .sort( ( a, b ) => a.createdTimestamp - b.createdTimestamp );

  const out: MessageParam[] = [];
  for ( const post of sorted ) {
    if ( post.author.bot && post.author.id !== LCARS47.user?.id ) continue;
    if ( post.createdTimestamp - recentAfter <= 0 ) continue;

    if ( post.author.id === LCARS47.user?.id ) {
      if ( post.mentions?.repliedUser?.id !== msg.author.id ) continue;
      const last = out[out.length - 1];
      if ( last?.role === 'assistant' ) continue; // coalesce: only keep first to maintain alternation
      out.push( { role: 'assistant', content: post.content } );
    }
    else {
      if ( !post.content.toLowerCase().startsWith( 'computer' ) ) continue;
      if ( post.author.id !== msg.author.id ) continue;
      const last = out[out.length - 1];
      if ( last?.role === 'user' ) continue;
      out.push( {
        role: 'user',
        content: `${post.author.displayName} - ${post.content}`
      } );
    }
  }

  // Anthropic requires the conversation to start with a user message.
  while ( out.length > 0 && out[0].role !== 'user' ) out.shift();

  return out;
}

async function buildUserContent ( text: string, attachmentIter: IterableIterator<Attachment> ): Promise<ContentBlockParam[]> {
  const attachments = [...attachmentIter];
  const blocks: ContentBlockParam[] = [];

  for ( const att of attachments ) {
    const ctype = ( att.contentType ?? '' ).toLowerCase();
    const lowerName = att.name?.toLowerCase() ?? '';

    if ( IMAGE_MIMES.has( ctype ) ) {
      const img: ImageBlockParam = {
        type: 'image',
        source: { type: 'url', url: att.url }
      };
      blocks.push( img );
      continue;
    }

    if ( PDF_MIMES.has( ctype ) || lowerName.endsWith( '.pdf' ) ) {
      const doc: DocumentBlockParam = {
        type: 'document',
        source: { type: 'url', url: att.url }
      };
      blocks.push( doc );
      continue;
    }

    const isTextDoc = TEXT_DOC_EXTS.has( extOf( lowerName ) ) || ctype.startsWith( 'text/' );
    if ( isTextDoc ) {
      const fetched = await fetchTextAttachment( att );
      if ( fetched != null ) {
        const doc: DocumentBlockParam = {
          type: 'document',
          source: {
            type: 'text',
            media_type: 'text/plain',
            data: fetched
          },
          title: att.name ?? undefined
        };
        blocks.push( doc );
      }
    }
  }

  blocks.push( { type: 'text', text: text === '' ? '(no message body)' : text } );
  return blocks;
}

function extOf ( name: string ): string {
  const dot = name.lastIndexOf( '.' );
  return dot >= 0 ? name.slice( dot ) : '';
}

async function fetchTextAttachment ( att: Attachment ): Promise<string | null> {
  if ( att.size > MAX_DOC_BYTES ) {
    Utility.log( 'warn', `[AI-CORE] Attachment ${att.name} exceeds ${MAX_DOC_BYTES} bytes; skipping.` );
    return null;
  }
  try {
    const res = await fetch( att.url );
    if ( !res.ok ) return null;
    return await res.text();
  }
  catch ( err ) {
    Utility.log( 'warn', `[AI-CORE] Failed to fetch attachment ${att.name}: ${( err as Error ).message}` );
    return null;
  }
}

async function sendReply ( msg: Message, reply: string ): Promise<void> {
  if ( reply.length > 2000 ) {
    Utility.log( 'info', '[AI-CORE] Response too long for Discord. Sending as file.' );
    const txtFile = new AttachmentBuilder( Buffer.from( reply, 'utf-8' ), {
      description: 'Response from LCARS47.',
      name: `${msg.author.tag}_response.txt`
    } );
    await msg.reply( { files: [txtFile] } ).catch( ( e: Error ) => {
      console.log( 'Failed to handle it the way it was intended.', e.message );
      void ( msg.channel as TextChannel ).send( { files: [txtFile] } );
    } );
    return;
  }

  Utility.log( 'info', '[AI-CORE] Got a response.' );
  await msg.reply( reply ).catch( ( e: Error ) => {
    console.log( e );
    void ( msg.channel as TextChannel ).send( `${msg.author.displayName} ${reply}` );
  } );
}
