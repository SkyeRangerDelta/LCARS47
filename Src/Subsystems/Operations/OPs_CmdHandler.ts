// -- COMMAND HANDLER --

// Imports
import * as fs from 'fs'
import Utility from '../Utilities/SysUtils.js'
import path from 'path'
import { LCARSClient } from '../Auxiliary/LCARSClient.js'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v10'

const PLDYNID = process.env.PLDYNID as string
const LCARSID = process.env.LCARSID as string
const MEDIALOG = process.env.MEDIALOG as string

// Exports
const CommandIndexer = {
  indexCommands
}

export default CommandIndexer

// Functions
async function indexCommands (LCARS47: LCARSClient): Promise<void> {
  const cmdJSON: object[] = []

  const cmdPath = path.join(__dirname, '../..', 'Commands/Active')
  const commandIndex = fs.readdirSync(cmdPath).filter(f => f.endsWith('.js'))
  for (const command of commandIndex) {
    const cPath = `../../Commands/Active/${command}`
    await import (cPath).then(c => {
      const cmd = c.default
      Utility.log('info', `[CMD-INDEXER] Indexing ${cmd.name}`)
      cmdJSON.push(cmd.data.toJSON())
      LCARS47.CMD_INDEX.set(cmd.data.name, cmd)
    })
  }

  Utility.log('warn', '[CMD-INDEXER] Starting command registration update.')
  const rest = new REST({ version: '9' }).setToken(process.env.TOKEN as string)
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        LCARSID,
        PLDYNID
      ),
      { body: cmdJSON }
    )
    Utility.log('warn', '[CMD-INDEXER] Finished command registration update.')
  } catch (cmdIndexErr) {
    Utility.log('err', '[CMD-INDEXER] ERROR REGISTERING/UPDATING SLASH COMMANDS!\n' + cmdIndexErr)
    LCARS47.destroy()
    process.exit()
  }
}
