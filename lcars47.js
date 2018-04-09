/*
======================================
--LCARS47 OFFICIAL PLDYN DISCORD BOT--
======================================
-----Developed and maintained by:-----
-----------SkyeRangerDelta------------
*/

//SYSTEM REQUIREMENTS AND DECLARATIONS
const Discord = require('discord.js');
const lcars = new Discord.Client();
const fs = require('fs');

const system = require('./lcars_subsystem.json');
const ch = require('./Subsystems/subs_channels.json');

const prefix = system.prefix;
const lcarsColor = "#f4eb42"
const lcarsAlertColor = "#d3150e"

var lcarsVersion = system.version;

//SESSION RECORDING & ENGINEERING MODE
let engmode;
var session;

var SUBS_Engm = JSON.parse(fs.readFileSync("./Subsystems/subs_engmode.json", "utf8"));
engmode = SUBS_Engm.engmode;

var SUBS_Sess = JSON.parse(fs.readFileSync("./Subsystems/subs_session.json", "utf8"));
session = SUBS_Sess.sessionnum++;
fs.writeFileSync("./Subsystems/subs_session.json", JSON.stringify(SUBS_Sess));

function engm() {
    engmode = !engmode;
}

//MESSAGE AND COMMAND SYSTEM HANDLER
lcars.on("message", msg => {
    if (msg.author.bot) return
    if (msg.content.indexOf(prefix) !== 0) return

    const cmd = msg.content.slice(prefix.length).trim().split(/ +/g);
    const cmdID = cmd.shift().toLowerCase();

    try {
        let cmdFile = require(`./Commands/${cmdID}.js`);
        cmdFile.run(lcars, msg, cmd);
    } catch (err) {
        console.error(err);
    }
});

//SYSTEM STARTUP

//Channels
var engdeckID = lcars.channels.get(ch.ch_engdeck);

//Responder
lcars.on("ready", () => {
    var startupseq = new Discord.RichEmbed();
        startupseq.setTitle("o0o - LCARS SYSTEM STARTUP - o0o");
        startupseq.setColor(lcarsColor);
        startupseq.setDescription(
            "LCARS Shipboard Operating System\n"+
            "Version " + lcarsVersion + " on session:" + session + ".\n"+
            "===================================\n"+
            "Booting from isolinear storage...\n"+
            "LCARS47 is now online."
        );

    console.log("LCARS V" + lcarsVersion + " | System Startup");
    console.log("====================================");
    console.log("[SESSION#] " + session);

    lcars.user.setActivity("!help | V" + lcarsVersion);

    console.log(engdeckID);
    console.log("JSON: " + ch.ch_engdeck);

    engdeckID.send({embed: startupseq}).then(sent => sent.delete(30000));
});

lcars.login(system.token);