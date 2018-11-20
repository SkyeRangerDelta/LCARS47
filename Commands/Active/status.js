//STATUS

const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');

exports.run = (lcars, msg, cmd) => {
    msg.delete();

    let mplayer;

    if (lcars.musicPlaying) {
        mplayer = "Online";
    }
    else {
        mplayer = "Not Active";
    }

    if (lcars.passiveSubroutine == undefined) {
        lcars.passiveSubroutine = "Offline";
    }

    if (lcars.pcAttempted == undefined) {
        lcars.pcAttempted = "Unknown";
    }

    var status = new Discord.RichEmbed();
        status.setTitle("o0o - LCARS SYSTEM STATUS - o0o");
        status.setColor(system.lcarscolor);
        status.setDescription(
            "**LCARS47 System Routine**: `" + lcars.systemStatus + "`\n"+
            "**Command Attempts**: `" + lcars.commandAttempts + "`\n"+
            "**Command Successes**: `" + lcars.commandSuccess + "`\n"+
            "**Command Failures**: `" + lcars.commandFailures + "`\n", true
        );
        status.addField("__Active Command Subroutine__",
            "**Status**: `" + lcars.activeSubroutine + "`\n" +
            "**Attempted**: `" + lcars.acAttempts + "`\n"+
            "**Succeeded**: `" + (lcars.acSuccess + 1) + "`\n"+
            "**Failed**: `" + lcars.acFailures + "`\n", true
        );
        status.addField("__Passive Command Subroutine__",
            "**Status**: `" + lcars.passiveSubroutine + "`\n"+
            "**Attempted**: `" + lcars.pcAttempted + "`\n" +
            "**Succeeded**: `" + lcars.pcSuccess + "`\n" +
            "**Failed**: `" + lcars.pcFailures + "`\n", true
        );
        status.addField("__Music Player Subroutine__", 
            "**Status**: `" + mplayer + "`\n");

    msg.channel.send({embed: status}).then(sent => sent.delete(30000));
}