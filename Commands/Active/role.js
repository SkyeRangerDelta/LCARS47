//ROLE

const Discord = require('discord.js');
const {botLog} = require(`../../Subsystems/subs_log`);
const chs = require(`../../Subsystems/subs_Ops/subs_channels.json`);

module.exports = {
    run,
    help
}

//Globals
let guildRoles;

function help() {
    return `Handles user role additions and removals.`;
}

async function run(lcars, msg, cmd) {
    msg.delete();

    botLog(`info`, `[ROLE-MGR] Starting role processing routines.`);

    //Get Guild
    let guild_PlDyn = lcars.guilds.cache.get(chs.pldyn);
    guildRoles = guild_PlDyn.roles.cache;

    /*
        Parse Command
        Possible Syntax:
            !role [roleName] -> Toggles Role
            !role -function -roleName -> Handles advanced functions
    */

    if (!msg.content.includes(`-`)) {
        //Checking for a role toggle

        let cmdBreakup = msg.content.toLowerCase().split(` `);
        cmdBreakup.shift();
        let roleName = cmdBreakup.join(` `);
        let handledRole = getRole(msg, roleName);

        if (handledRole != null) {
            toggleRole(msg, handledRole);
        }

    } else {
        //Command contained a hyphen, seek advanced control
        switch (cmd[0].trim()) {
            case `info`:
                infoRole(msg, cmd);
                break;
            case `join`:
                toggleRole(msg, getRole(cmd[1].trim()));
            default:
                return msg.reply(`Specified parameter was not found relevant.`).then(sent => sent.delete({timeout: 10000}));
        }
    }
}

//Get Guild Role
function getRole(msg, targetRole) {
    for (let roleItem of guildRoles.values()) {
        if (roleItem.name.toLowerCase() == targetRole) {
            return roleItem;
        }
    }

    msg.reply(`Archives could not locate that role record.`).then(sent => sent.delete({timeout: 10000}));
    return null;
}

//Add/Remove role given a role assignment
async function toggleRole(msg, roleObj) {

    let memberRoles = msg.member.roles.cache;

    for (let memberRole of memberRoles.values()) {
        if (memberRole.name.toLowerCase() == roleObj.name.toLowerCase()) {
            msg.member.roles.remove(roleObj, `User requested role removal via command.`);
            botLog(`proc`, `[ROLE-MGR] Removed the role ${roleObj.name} from ${msg.author.username}`);
            return msg.reply(`Role removed.`).then(sent => sent.delete({timeout: 5000}));
        }
    }

    msg.member.roles.add(roleObj, `User requested role addition via command.`);
    botLog(`proc`, `[ROLE-MGR] Added the role ${roleObj.name} to ${msg.author.username}`);
    return msg.reply(`Role added.`).then(sent => sent.delete({timeout: 5000}));
}

//Return info on a given target role
async function infoRole(msg, cmd) {
    //Parse role
    let targetRole = cmd[1].trim();
    let checkResponse = getRole(msg, targetRole);

    if (checkResponse != null) {
        return msg.reply(`Archive information for this record has not been completed.`).then(sent => sent.delete({timeout: 10000}));
    }
}