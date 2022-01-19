/////////////////////////////////////////////
//              LCARS47
//   The Official PlDyn Discord Bot
//
//      Developed and Maintained
//          By SkyeRangerDelta
//-------------------------------------------
//      See https://pldyn.net
//  And blog: https://cf.pldyn.net/
//   Wiki: https://wiki.pldyn.net/
//
//  This is a custom bot designed for the
//      Planetary Dynamics Development
//              Community
/////////////////////////////////////////////
// -- DEPENDENCIES --
//Libraries
const Discord = require('discord.js');
const fs = require('fs');
//Subsystem Configs
const { TOKEN, INTENTS } = require('./Subsystems/subs_Ops/OPs_Core.json');
// -- GLOBALS --
const LCARS47 = new Discord.client({ intents: INTENTS });
// -- EVENTS INDEXER --
const eventsIndex = fs.readdirSync('./Events').filter(f => f.endsWith('.js'));
for (const eventFile in eventsIndex) {
    const event = require(`./Events/${eventsIndex[eventFile]}`);
    if (event.once) {
        LCARS47.once(event.name, (...args) => event.execute(LCARS47, ...args));
    }
    else {
        LCARS47.on(event.name, (...args) => event.execute(LCARS47, ...args));
    }
}
// -- UTILS --
// -- CORE --
LCARS47.login(TOKEN);
//# sourceMappingURL=lcars47.js.map