//ROLE

const Discord = require('discord.js');
const system = require('../../Subsystems/lcars_subsystem.json');
const chs = require('../../Subsystems/subs_channels.json');

exports.run = (lcars, msg, cmd) => {

    msg.delete();

    let requestChannel = lcars.channels.get(chs.roleRequest);
    let game = cmd[0].toLowerCase();

    //Command Placement Check
    if (msg.channel != requestChannel) {
        return msg.reply("Command only available in the #role-requester channel.").then(sent => sent.delete(20000));
    }

    //Channel Initializer
    if (game == "menu") {
        var roleMenu = new Discord.RichEmbed();
        roleMenu.setTitle("o0o - ROLE MENU - o0o");
        roleMenu.setColor(system.lcarscolor);
        roleMenu.setDescription("Add and remove game roles from yourself by using the `!role [game]` command! Specify any of the following games to assign/remove the associated role from yourself.\n\nAnd yes, it does need to be all one word. (It's not case sensitive either.)");
        roleMenu.addField("Available Games",
            "`Starbound`\n`Minecraft`\n`Terraria`\n`EliteDangerous` (or `ed` or `elite`)\n`Warframe`\n`SpaceEngineers` (or `se`)\n`7DTD`\n`TF2`\n`Fallout4`\n`Skyrim`\n`RocketLeague` (or `rl`)\n`Factorio`\n`DarkSouls` (or `ds`)\n`NoMansSky` (or `nms`)");    
        
        requestChannel.send({embed: roleMenu});
        return requestChannel.send("======================================================================");
    }


    //Command Arrays
    let gameRoles = ["starbound", "minecraft", "terraria", "elite", "elitedangerous", "ed", "warframe", "spaceengineers", 
                    "se", "7dtd", "tf2", "fallout4", "skyrim", "rocketleague", "rl", "factorio", "ds", 
                    "darksouls", "nms", "nomanssky"];
    let roles = [];

    //Initialize Roles
    gameRoles.forEach(gameRole => {roles.push(msg.guild.roles.find('name', gameRole.toLowerCase()))});

    switch (game) {
        case gameRoles[0]:
            role("Protector");
            break;
        case gameRoles[1]:
            role("Minecraftian");
            break;
        case gameRoles[2]:
            role("Terrarian");
            break;
        case gameRoles[3]:
            role("CMDR");
            break;
        case gameRoles[4]:
            role("CMDR");
            break;
        case gameRoles[5]:
            role("CMDR");
            break;
        case gameRoles[6]:
            role("Warframe Operator");
            break;
        case gameRoles[7]:
            role("Space Engineer");
            break;
        case gameRoles[8]:
            role("Space Engineer");
            break;
        case gameRoles[9]:
            role("Survivor");
            break;
        case gameRoles[10]:
            role("Mercenary");
            break;
        case gameRoles[11]:
            role("Vault Dweller");
            break;
        case gameRoles[12]:
            role("Dovahkiin");
            break;
        case gameRoles[13]:
            role("Rocket Car Driver");
            break;
        case gameRoles[14]:
            role("Rocket Car Driver");
            break;
        case gameRoles[15]:
            role("Belt Repairman");
            break;
        case gameRoles[16]:
            role("Darksign Carrier");
            break;
        case gameRoles[17]:
            role("Darksign Carrier");
            break;
        case gameRoles[18]:
            role("Traveller");
            break;
        case gameRoles[19]:
            role("Traveller");
            break;
        default:
            return msg.reply("Failed. Invalid role parameter.").then(sent => sent.delete(20000));
            break;
    }

    function role(role2) {
        var role;

        try {
            role =  msg.guild.roles.find('name', role2);
        }
        catch {
            msg.reply("Failed. Role could not be identified.");
        }

        console.log("Attempting to remove " + role.name + " from " + msg.author.username);

        if (msg.member.roles.find('name', role2)) {
            msg.member.removeRole(role);
            msg.reply(role2 + " role removed!").then(sent => sent.delete(20000));
        }
        else {
            msg.member.addRole(role);
            msg.reply(role2 + " role added!").then(sent => sent.delete(20000));
        }
    }
}