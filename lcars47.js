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

const prefix = "!";

const mainColor = "#f4eb42";
const emerColor = "#d3150e";

const lcarsVersion = "47.5.0.00";

//FUNCTION SYSTEMS
//Command Structure
function command(str, msg) {
    return msg.content.startsWith(prefix + str);
}

//STARTUP PROCEDURES
lcars.on('ready', () => {

    //Startup Embed
    var startupseq = new Discord.RichEmbed();
        startupseq.setTitle("o0o...LCARS47 STARTUP...o0o");
        startupseq.setColor(mainColor);
        startupseq.setDescription(
            
        )
})