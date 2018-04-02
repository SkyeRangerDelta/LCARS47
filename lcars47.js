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

const commands = require('./Commands');

console.log(commands);

const prefix = "!";

const thumbnail = './thumbnail.png'
const mainColor = "#f4eb42";
const emerColor = "#d3150e";

const lcarsVersion = "47.5.2.00";

//GLOBAL SYSTEM VARIABLES
let engmode = false;

//STARTUP PROCEDURES
    //SESSION RECORDING SYSTEM
    var lcarsVarsDoc = JSON.parse(fs.readFileSync('./lcars_vars.json', 'utf8'));
    var lcarsSessionNum = lcarsVarsDoc.sessionnum++;

    console.log("[SESSION#] " + lcarsSessionNum);

    fs.writeFileSync("./lcars_vars.json", JSON.stringify(lcarsVarsDoc));

//READY EVENT HANDLER
lcars.on('ready', () => {

    //Channel Definitions
    var serverAnnouncements = lcars.channels.get('341454723771138048');

    //Startup Embed
    var startupseq = new Discord.RichEmbed();
        startupseq.setTitle("o0o...LCARS47 STARTUP...o0o");
        startupseq.setColor(mainColor);
        startupseq.setDescription(
            "Booting LCARS from isolinear storage...\n"+
            "Initializing holosystems...\n"+
            "LCARS now booted, performing checks...\n"+
            "=============================================\n" +
            "LCARS READY | V" + lcarsVersion + " ready and running.\n"+
            "LCARS Session: " + lcarsSessionNum
        );

    console.log("LCARS V" + lcarsVersion + " booted successfully.");
    console.log("================================================");
    console.log("[SESSION#] " + lcarsSessionNum);
    console.log("[ENG-MODE] Setting: " + engmode);

    lcars.user.setActivity("!help | V" + lcarsVersion);

    serverAnnouncements.send({embed: startupseq}).then(sent => sent.delete(20000));


});

//COMMANDS AND CORE SYSTEMS
lcars.on('message', async msg => {
    if (!msg.member || msg.member.id === lcars.user.id) return

    let args = msg.content.substring(prefix.length).split(' ');
    let cmd = commands[args.splice(0, 1)[0]]; 

    console.log(args);
    console.log(cmd);

    if (!cmd) {
        return
    }

    cmd.run({args, lcars, msg})
    .then((t) => {
        msg.channel.send(t);
    });

    //INTER-SYSTEM VARIABLES

    //FUNCTION SYSTEMS
    //Command Structure
    /*function commandis(cmd, msg) {
        return msg.content.startsWith(prefix + cmd);
    }*/

    //COMMANDS (Sorted Alphabetically)
        //Engineering Mode
        //IPs
        //Version
        //Status


    //COMMAND EMBEDS
    //Version
    var version = new Discord.RichEmbed();
        version.setTitle("o0o...VERSION REPORT...o0o");
        version.setColor(mainColor);
        version.setDescription(
            "LCARS is currently running on version:\n`" + lcarsVersion +
            "`\n\nSee SkyeRangerDelta or any Dev Team member for information on LCARS systems or development."
        );

    //Engineering Mode
    var engembed = new Discord.RichEmbed();
        engembed.setTitle("o0o...LCARS SESSION STATUS REPORT...o0o");
        engembed.setColor(mainColor);
        engembed.setDescription(
            "LCARS self-diagnostics report for session " + lcarsSessionNum + ".\n"+
            ""
        );


    //COMMAND CALLS
    //Engineering Mode
    /*if (commandis("engm", msg)) {
        msg.delete();

        if (msg.member.roles.find('name', 'Dev Team')) {
            engm();
        }
        else {
            msg.reply("You don't have the necessary permissions to toggle ENGM!");
        }
    }

    //Version
    if (commandis("version", msg)) {
        msg.delete();

        msg.channel.send({embed: version}).then(sent => sent.delete(30000));
    }*/

});

lcars.login('MzQxNDI1NzE1MjEzNzYyNTgy.DGBAeA.ZegiYgeOdilwAmLijQJja3CNBjc');