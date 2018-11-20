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

const system = require('./Subsystems/lcars_subsystem.json');
const ch = require('./Subsystems/subs_channels.json');

const prefix = system.prefix;
const lcarsColor = system.lcarscolor;
const lcarsAlertColor = system.lcarsalertcolor;

//LCARS SYSTEM WIDE VARIABLES
lcars.queue = new Map();
lcars.commandAttempts = 0;
lcars.commandFailures = 0;
lcars.commandSuccess = 0;
lcars.acAttempts = 0;
lcars.acFailures = 0;
lcars.acSuccess = 0;
lcars.pcAttempts = 0;
lcars.pcFailures = 0;
lcars.pcSuccess = 0;
lcars.pldynGuildID = "107205223985999872";
lcars.pldynGuild = lcars.guilds.get(lcars.pldynGuildID);
lcars.musicPlaying = false;
lcars.vc;
lcars.version = system.version;
lcars.systemStatus;
lcars.activeSubroutine;
lcars.passiveSubroutine;

//SESSION RECORDING & ENGINEERING MODE
lcars.engmode;
lcars.session;

var SUBS_Engm = JSON.parse(fs.readFileSync("./Subsystems/subs_engmode.json", "utf8"));
lcars.engmode = SUBS_Engm.engmode;

var SUBS_Sess = JSON.parse(fs.readFileSync("./Subsystems/subs_session.json", "utf8"));
lcars.session = SUBS_Sess.sessionnum++;
fs.writeFileSync("./Subsystems/subs_session.json", JSON.stringify(SUBS_Sess));

let engmode = lcars.engmode;

//MESSAGE AND COMMAND SYSTEM HANDLER
lcars.on("message", msg => {
    if (msg.author.bot) return

    const pcmd = msg.content.split(" ");
    const cmd = msg.content.slice(prefix.length).trim().split(/ +/g);
    const cmdID = cmd.shift().toLowerCase();

    if (msg.content.charAt(0) == prefix) {
        console.log("[ACT-COMM] Attempting Resolution for command: " + cmdID);
        lcars.commandAttempts++;
        lcars.acAttempts++;
        try {
            let cmdFile = require(`./Commands/Active/${cmdID}.js`);
            cmdFile.run(lcars, msg, cmd);
            console.log("[ACT-COMM] Success");
            lcars.commandSuccess++;
            lcars.acSuccess++;
            lcars.activeSubroutine = "Online";
        }
        catch (err) {
            console.log("[ACT-COMM] Failed:\n" + err);
            msg.reply("Command input rejected. Please specify a more concise command; see `!help` for assistance.");
            lcars.activeSubroutine = "Last Command Failed";
            lcars.acFailures++;
        }
    }
    else {//PASSIVE COMMANDS
        console.log("[PAS-COMM] Attempting Resolution for command: " + pcmd[0]);
        lcars.commandAttempts++;
        lcars.pcAttempts++;
        try {
            let pCmdFile = require(`./Commands/Passive/${pcmd[0].toLowerCase()}.js`);
            pCmdFile.run(lcars, msg, cmd);
            console.log("[PAS-COMM] Success");
            lcars.commandSuccess++;
            lcars.pcSuccess++;
            lcars.passiveSubroutine = "Online";
        } catch (err) {
            console.log("[PAS-COMM] Failed: " + err);
            lcars.passiveSubroutine = "Reading Chat";
            lcars.pcFailures++;
        }
    }
});

//SYSTEM STARTUP
//Responder
lcars.on("ready", () => {
    var startupseq = new Discord.RichEmbed();
        startupseq.setTitle("o0o - LCARS SYSTEM STARTUP - o0o");
        startupseq.setColor(lcarsColor);
        startupseq.setDescription(
            "LCARS Shipboard Operating System\n"+
            "Version " + lcars.version + " on session #: " + lcars.session + ".\n"+
            "===================================\n"+
            "Booting from isolinear storage...\n"+
            "LCARS47 is now online."
        );
        
    console.log("LCARS V" + lcars.version + " | System Startup");
    console.log("====================================");
    console.log("[SESSION#] " + lcars.session);
    console.log("[ENG-MODE] Currently: " + engmode);

    const engdeckID = lcars.channels.get(ch.engdeck);
    
    lcars.systemStatus = "Online";
    lcars.user.setActivity("!help | V" + lcars.version);

    engdeckID.send({embed: startupseq}).then(sent => sent.delete(30000));
});

lcars.login(system.systemKEY);