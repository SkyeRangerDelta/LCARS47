// -- ROLE --
// Functions for self-assigning roles

// Imports
import { type LCARSClient } from '../../Subsystems/Auxiliary/LCARSClient.js';
import {
  type BooleanCache,
  type CacheType,
  type ChatInputCommandInteraction,
  type DiscordAPIError,
  type GuildMemberRoleManager,
  type InteractionResponse, MessageFlags,
  type Role
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import Utility from '../../Subsystems/Utilities/SysUtils.js';
import type { Command } from '../../Subsystems/Auxiliary/Interfaces/CommandInterface';

// Cmd Data
const data = new SlashCommandBuilder()
  .setName( 'role' )
  .setDescription( 'Enables functions for self-assigning roles.' );

data.addSubcommand( s => s
  .setName( 'join' )
  .setDescription( 'Join a role.' )
  .addRoleOption( o => o
    .setName( 'role-name' )
    .setDescription( 'Role to assign.' )
    .setRequired( true )
  )
);

data.addSubcommand( s => s
  .setName( 'leave' )
  .setDescription( 'Leave a role.' )
  .addRoleOption( o => o
    .setName( 'role-name' )
    .setDescription( 'Role to remove.' )
    .setRequired( true )
  )
);

// Functions
async function execute ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<InteractionResponse<BooleanCache<CacheType>>> {
  const subCmd = int.options.getSubcommand();

  Utility.log( 'info', `[ROLE-SYS] Received a new ${subCmd} role command.` );

  switch ( subCmd ) {
    case 'join':
      return await joinRole( LCARS47, int );
    case 'leave':
      return await leaveRole( LCARS47, int );
    default:
      return await int.reply( {
        content: 'Unauthorized segment access. Command terminated.',
        flags: MessageFlags.Ephemeral
      } );
  }
}

async function joinRole ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<InteractionResponse> {
  if ( int.member != null ) {
    const roleManager = int.member.roles as GuildMemberRoleManager;
    const cmdOptions = int.options;

    try {
      await roleManager.add( cmdOptions.getRole( 'role-name' ) as Role );
    }
    catch ( e ) {
      const err = e as DiscordAPIError;
      if ( err.message.includes( 'Missing Permissions' ) ) {
        Utility.log( 'warn', '[ROLE-SYS] Unable to add role\n' + err.message );
        return await int.reply( {
          content: 'Permissions failure, are you trying to add a role above your paygrade?',
          flags: MessageFlags.Ephemeral
        } );
      }
      else {
        Utility.log( 'warn', '[ROLE-SYS] Unable to add role\n' + err.message );
        return await int.reply( {
          content: 'Unable to add role to you. Do you already have it?',
          flags: MessageFlags.Ephemeral
        } );
      }
    }

    Utility.log( 'warn', '[ROLE-SYS] Role added' );
    return await int.reply( {
      content: 'Role added.',
      flags: MessageFlags.Ephemeral
    } );
  }
  else {
    return await int.reply( {
      content: 'Segment fault: unable to identify member role manager.',
      flags: MessageFlags.Ephemeral
    } );
  }
}

async function leaveRole ( LCARS47: LCARSClient, int: ChatInputCommandInteraction ): Promise<InteractionResponse> {
  const targetRole = int.options.getRole( 'role-name' ) as Role;
  if ( int.member != null ) {
    const roleManager = int.member.roles as GuildMemberRoleManager;

    try {
      await roleManager.remove( targetRole );
    }
    catch ( e ) {
      const err = e as DiscordAPIError;
      if ( err.message.includes( 'Missing Permissions' ) ) {
        Utility.log( 'warn', '[ROLE-SYS] Unable to remove role\n' + err.message );
        return await int.reply( {
          content: 'Permissions failure, are you trying to resign without approval?',
          flags: MessageFlags.Ephemeral
        } );
      }
      else {
        Utility.log( 'warn', '[ROLE-SYS] Unable to remove role\n' + err.message );
        return await int.reply( {
          content: 'Unable to remove a role from you, do you mean to add it instead?',
          flags: MessageFlags.Ephemeral
        } );
      }
    }

    Utility.log( 'warn', '[ROLE-SYS] Role removed' );
    return await int.reply( {
      content: 'Role removed.',
      flags: MessageFlags.Ephemeral
    } );
  }
  else {
    return await int.reply( {
      content: 'Segment fault: unable to identify member role manager.',
      flags: MessageFlags.Ephemeral
    } );
  }
}

function help (): string {
  return 'Enables functions for self-assigning roles.';
}

// Exports
export default {
  name: 'Role',
  data,
  execute,
  help
} satisfies Command;
