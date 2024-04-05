// -- Events Indexer --

// Imports
import * as fs from 'fs'
import { Client } from 'discord.js'
import Utility from '../Utilities/SysUtils.js'
import * as path from 'path'

// Exports
const EventsIndexer = {
  indexEvents
}

export default EventsIndexer

// Functions
async function indexEvents (LCARS47: Client): Promise<void> {
  const evPath = path.join(__dirname, '../..', 'Events')
  const eventsIndex = fs.readdirSync(evPath).filter(f => f.endsWith('.js'))
  for (const event of eventsIndex) {
    await import(`../../Events/${event}`).then(e => {
      const ev = e.default
      Utility.log('info', `[EVENT-HANDLER] Indexing ${ev.name}`)
      if (ev.once) {
        LCARS47.once(ev.name, (...args) => ev.execute(LCARS47, ...args))
      } else {
        LCARS47.on(ev.name, (...args) => ev.execute(LCARS47, ...args))
      }
    })
  }
}
