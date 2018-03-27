require ('events').EventEmitter.prototype._maxListeners = 100;


//CONSTANT DECLARATIONS
const Discord = require("discord.js");
const lcars47 = new Discord.Client();
const prefix = "!"

const lcarsColor = "#f4eb42"
const lcarsAlertColor = "#d3150e"

const ytdl = require("ytdl-core");

const Gamedig = require('gamedig');

const lcarsVersion = "47.4.1.00";

//NON-IMPLEMENTED

//SYSTEM BACKGROUND


//OPTIMIZATION MEASURES
function command(str, msg) {
  return msg.content.startsWith(prefix + str);
}

//STARTUP PROCEDURES
lcars47.on('ready', () => {

  var startupseq = new Discord.RichEmbed();
    startupseq.setTitle(" o0o - LCARS47 SYSTEM STARTUP - o0o")
    startupseq.setColor(lcarsColor)
    startupseq.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg?dl=0")
    startupseq.setDescription(
      "LCARS47 Startup Sequence Initialized." + "\n" +
      "Booting from isolinear storage." + "\n" +
      "Version initialized: " + lcarsVersion + "\n" +
      "*Removing startup message in 10 seconds...*"
    )

    lcars47.user.setGame("with dilithium crystals");

    console.log(`Logged in as ${lcars47.user.tag}!`);
    console.log('Successfully booted LCARS47 Version 47');
    console.log('======================================');

  var serverAnnouncements = lcars47.channels.get('341454723771138048');
  var engineeringConsole = lcars47.channels.get('107205223985999872');

    serverAnnouncements.send({embed: startupseq}).catch(console.error).then(sent => sent.delete(10000));

});

//COMMAND STRUCTURE
lcars47.on('message', async msg => {

  const args = msg.content.split(" ").slice(1);

  //ANNOUNCEMENT SYSTEM\
  var serverAnnouncements = lcars47.channels.get('341454723771138048');

  if (command("announce", msg)) {
    var message = args.join(" ");
    var Announce = new Discord.RichEmbed();
      Announce.setTitle("o0o - SYSTEM ALERT MESSAGE - o0o")
      Announce.setColor(lcarsColor)
      Announce.setDescription("@everyone " + message)

        msg.delete();

        serverAnnouncements.send({embed: Announce})
  }

  //!HELP OR !COMMANDS
  var commands = new Discord.RichEmbed();
    commands.setTitle("o0o - LCARS47 SYSTEM MESSAGE - o0o")
    commands.setColor(lcarsColor)
    commands.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
    commands.setDescription(
        "Use the system prefix '!' before commands!" + "\n" +
        "===============================================" + "\n" +
        "**about** : Defines Planetary Dynamics Development." + "\n" +
        "**channels** : Describes how channels work." + "\n" +
        "**commands** : You're reading it." + "\n" +
        "**flywheel** : Provides instructions on how to install the PlDyn Flywheel modpack for Minecraft." + "\n" +
        "**hello** : Hi!" + "\n" +
        "**help** : Really? Also works like !commands." + "\n" +
        "**ip** : Gives a list of PlDyn game server IP addresses." + "\n" +
        "**keywords** : Lists a series of interesting words." + "\n" +
        "**lcars** : Explains the all powerful shipboard system, LCARS." + "\n" +
        "**links** : Lists a series of links to websites that you might need." + "\n" +
        "**projects** : Lists off all of the projects that PlDyn is actively working on." + "\n" +
        "**roles** : Defines all the roles you see on the server." + "\n" +
        "**rules** : Read this. It's good for your soul." + "\n" +
        "**system**: LCARS will explain." + "\n" +
        "**version** : States the running version of LCARS." + "\n" +
        "**vessel** : States this ship's information." + "\n" + "\n" +
        "``This message will remove itself in 1 minute.``"
    )

    //KEYWORDS!
    var keywords = new Discord.RichEmbed();
      keywords.setTitle("o0o - LCARS SYSTEM MESSAGE - o0o")
      keywords.setColor(lcarsColor)
      keywords.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
      keywords.setDescription(
        "Want to see LCARS say something abnormal? Here's a list of triggers." + "\n" +
        "===============================================" + "\n" +
        "dead" + "\n" +
        "sock" + "\n" +
        "berg" + "\n" +
        "redshirt"
      )

      //IP
      var ip = new Discord.RichEmbed();
        ip.setTitle("o0o - LCARS SYSTEM MESSAGE - o0o")
        ip.setColor(lcarsColor)
        ip.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
        ip.setDescription(
          "Here's a list of all the servers that you can access via the Planetary Dynamics Network." + "\n\n" +
          "**Minecraft**\n" + 
          "*Vanilla - Aplaria Custom Map*: ``192.99.126.105``  ``21213``\n" +
          "*Modded - Flywheel Pack*: ``Not added yet``\n\n" + 
          "**Starbound**\n"+
          "*Vanilla*: ``192.99.126.107`` ``51213``\n"+
          "*Modded*: ``192.99.126.107``  ``51214``\n\n"+
          "*Use this to log into the server*:\n"+
          "__PlDyn Players__:\n"+
          "  User: ``pldyn``\n"+
          "  Pass: ``pldynstar``\n\n"+
          "**7 Days to Die**\n"+
          "*Address: ``158.69.122.79``  ``61214``    Password: ``pldyn7d``\n"+
          "*(Has spawn tweaks for animals and loot respawn)*\n\n"
        )


      //FLYWHEEL INSTRUCTIONS
      var flywheel = new Discord.RichEmbed();
        flywheel.setTitle("o0o - FLYWHEEL INSTALL STEPS (I) - o0o")
        flywheel.setColor(lcarsColor)
        flywheel.setDescription(
          "__PREPARE YOUR SYSTEM__" + "\n" +
          "1.) Press ``Windows Key`` + ``R`` to open the Run command. Type in ``%appdata%`` and hit enter. This will open your ``roaming`` folder." + "\n" +
          "2.) Open the ``.minecraft`` folder." + "\n" +
          "3.) Depending on if you've had mods installed or not, you'll want to make sure that your ``mods`` folder is empty or not even there. If you don't have one, don't worry." + "\n" +
          "4.) Leave this folder open. We'll need it again later."
        )

      var flywheel2 = new Discord.RichEmbed();
        flywheel2.setDescription(
          "__INSTALLING FORGE FOR 1.7.10__ (*Skip if you already have Forge installed for 1.7.10*)" + "\n" +
          "1.) Visit [the Minecraft Forge site](http://files.minecraftforge.net/maven/net/minecraftforge/forge/index_1.7.10.html)." + "\n" +
          "2.) Make sure that you are looking at the 1.7.10 version (link should have lead there) and download the ``installer`` version." + "\n" +
          "3.) Once this downloads, open it. Make sure that ``Install Client`` is ticked. Leave everything else alone and click ``install``." + "\n" +
          "4.) Once it has downloaded all the necessary libraries and given you a confirmation dialog. Close it and open the Minecraft launcher." + "\n" +
          "5.) Inside the launcher, click on the green arrow next to the play button and select the newly created ``Forge 1.7.10`` profile. Click play and let it load." + "\n" +
          "6.) When you reach the main menu of the game, make sure that in the bottom left, it says there are only 3 mods loaded. If this is true, close Minecraft and continue on."
          )

      var flywheel3 = new Discord.RichEmbed();
        flywheel3.setDescription(
          "__INSTALLING THE FLYWHEEL PACK__" + "\n" +
          "1.) Visit [this link](https://mega.nz/#!G1ZzzDha!LPbM1EW1P_igYTxcNZayGFmBGGTJKVU7gpkuPSFnm8s) and download the 'PlDyn_Flywheel.zip' package." + "\n" +
          "2.) This is a MEGA link, make sure to download the file through your browser." + "\n" +
          "3.) Once downloaded, open the ZIP package in a new window. (If defaulted to 7ZIP or WinRar this will happen automatically. If neither of these are installed, make sure you right click on the ZIP and select ``open in new window``." + "\n" +
          "4.) Now pull up the ``.minecraft`` window we opened earlier. Place them where you can drag items back and forth." + "\n" +
          "5.) You'll note inside the ``.minecraft`` folder, there are some new folders and files. Open the ``mods`` folder." + "\n" +
          "6.) There should be nothing in there. Go back to the ZIP package. Select everything in the ZIP and then drag the files from the ZIP into the ``mods`` folder window." + "\n" +
          "7.) Once this is done, back out of the ``mods`` folder and select ``options.txt``. Delete this file. It is necessary for now that you do this to prevent crashes." + "\n" +
          "8.) You can now close all open windows and open the Minecraft launcher. Click the play button making sure that the ``1.7.10 Forge`` profile is selected." + "\n" +
          "9.) The game should show some progress bars and text that shows what stage it is on in loading. Once you make it to the main menu, you should have a much higher number of mods installed on the lower left." + "\n" +
          "10.) You can now freely join the PlDyn MC - Mzulft server. If you don't have the IP address, grab it from LCARS with ``!ip``." + "\n" +
          "11.) Enjoy!"
         )

      //COMMAND CALL FOR HELP AND KEYWORDS
      if (command("help", msg)) {
        msg.delete();

        msg.channel.send({embed: commands}).then(sent => sent.delete(60000));
      }

      if (command("commands", msg)) {
        msg.delete()

        msg.channel.send({embed: commands}).then(sent => sent.delete(60000));
      }

      if (command("flywheel", msg)) {
        msg.delete();

        msg.author.send({embed:flywheel}).then(5000);
        msg.author.send({embed:flywheel2}).then(5000);
        msg.author.send({embed:flywheel3});
      }

      if (command("keywords", msg)) {
        msg.delete();

        msg.channel.send({embed: keywords});
      }

      //IP COMMAND
      if (command("ip", msg)) {
        msg.delete();

        msg.channel.send({embed: ip}).then(sent => sent.delete(60000));
      }

      if (command("iptest", msg)) {
        msg.delete();

        msg.channel.send("[Click to Connect](steam://connect/131.153.27.242:27500)");
      }

      //ABOUT
      var about = new Discord.RichEmbed();
        about.setTitle("o0o - ABOUT PLDYN - o0o")
        about.setColor(lcarsColor)
        about.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg");
        about.setDescription(
          "Planetary Dynamics is a group of programmers, modders, developers, gamers, and some other interesting variants that come together to make awesome happen. Stick around and follow the !rules, something awesome might happen."
        )

      if (command("about", msg)) {
        msg.delete();

        msg.channel.send({embed: about});
      }

      //CHANNELS
      var channels = new Discord.RichEmbed();
        channels.setTitle("o0o - CHANNELS LIST - o0o")
        channels.setColor(lcarsColor)
        channels.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
        channels.setDescription(
          "Welcome aboard; here's an explantation of the ship's layout. Each channel is sorted based on permissions used to enter and then by how often they are used. Descriptors below." + "\n" +
          "===============================================" + "\n" +
          "__Text Communications__" + "\n" +
          "**Captain's Readyroom**: Used for one-on-one conversations with the Admiral." + "\n" +
          "**The Bridge**: Highest ranking officers only." + "\n" +
          "**Crew Deck**: Ranked officers only." + "\n" +
          "**Ten Forward/Quark's Bar**: General Chat - everyone has access." + "\n" +
          "**Engineeing Deck**: LCARS47's stomping grounds. Beware, he might ban you in here. It's where we run all his debug and testing." + "\n" +
          "**Systems Analysis**: Console where you can view server status inquiries." + "\n" +
          "**Server Announcements**: If information is in need of reaching you, this is where you'll see it. Please don't mute this channel." + "\n" +
          "**Developer Updates**: This is where LCARS or PlDyn ``!projects`` will be shared when updated. Usually handled by a webhook into GitHub." + "\n" +
          "**Transporter Room**: Landing pad for newcomers." + "\n" +
          "===============================================" + "\n" +
          "__Away Team Communications__" + "\n" +
          "These channels are where LCARS will relay Discord chat with any linked server such as Minecraft. Each channel listed here sends and recieves chat purely from it's respective server and nowhere else." + "\n" +
          "===============================================" + "\n" +
          "__Voice Communications__" + "\n" +
          "**Captain's Quarters**: This channel is for one-on-one voice chat with the Admiral." + "\n" +
          "**The Bridge**: Highest Ranking Officers only." + "\n" +
          "**Crew Lounge**: Ranked officers only." + "\n" +
          "**Conference Room**: Where staff discussions about PlDyn take place. Basically any serious subject." + "\n" +
          "**Astrometrics**: Engineering Team's playground. Can only be used by Engineering Team personnel." + "\n" +
          "**Ten Forward/Quark's Bar**: General Chat - keep it clean please. Anyone has access." + "\n" +
          "**Entertainment Deck**: Ok, maybe not as strict on cleanliness as Ten Forward." + "\n" +
          "**AFK**: 30 minutes of vocal inactivity will send you here." + "\n" + "\n" +
          "``This message will remove itself in 1 minute.``"
        )

        if (command("channels", msg)) {
          msg.delete();

          msg.channel.send({embed: channels}).then(sent => sent.delete(60000));
        }
      //HELLO
      var hi = new Discord.RichEmbed();
        hi.setTitle("o0o - SYSTEM - o0o")
        hi.setColor(lcarsColor)
        hi.setDescription(
          "Greetings! I am LCARS47, your shipboard operating system. My purpose is to (pass the butter) assist you and whoever you may be with during your time here. I do bid thee a warning, should you mess with me, I'll mess back. Please abide by all system !rules and use !help or !commands to talk with me!"
        )

      if (command("hello", msg)) {
        msg.delete();

        msg.channel.send({embed: hi});
      }

      //LCARS
      var lcarsb = new Discord.RichEmbed();
        lcarsb.setTitle("o0o - HISTORY OF LCARS - o0o")
        lcarsb.setColor(lcarsColor)
        lcarsb.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
        lcarsb.setDescription(
          "LCARS47 is the shipboard operating system used in Gene Roddenberry's *Star Trek: The Next Generation* aboard the *USS Enterprise-D*. PlDyn is a sci-fi based community in it's deeper roots so it was only fit that since we made the Discord server in the style of the Enterprise, that we also have an on-board AI named LCARS to help run the system."
        )

      if (command("lcars", msg)) {
        msg.delete();

        msg.channel.send({embed: lcarsb});
      }

      //LINKS
      var link = new Discord.RichEmbed();
        link.setTitle("o0o - LINKS - o0o")
        link.setColor(lcarsColor)
        link.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
        link.setDescription(
          "**PlDyn Dev Blog**: https://pldyndev.wordpress.com/" + "\n" +
          "**PlDyn on Steam**: http://steamcommunity.com/groups/PlDyn" + "\n" +
          "**PlDyn on Facebook**: https://www.facebook.com/groups/pldyn" + "\n" +
          "**PlDyn Flagship Site**: http://pldynmedia.nn.pe"
        )

      if (command("links", msg)) {
        msg.delete();

        msg.channel.send({embed: link});
      }

      var overrides = new Discord.RichEmbed();
        overrides.setTitle("o0o - SERVER OVERRIDES - o0o")
        overrides.setColor(lcarsColor)
        overrides.setDescription(
          "The custom IPs used on some servers may not function like they should, use these if that happens." + "\n" +
          "**Minecraft**:" + "\n" +
          "-->Btharzdam: ``131.153.27.26:25569``" + "\n" +
          "-->Mzulft: ``131.153.27.26:25571``"
          )

      if (command("overrides", msg)) {
        msg.delete();

        msg.channel.send({embed:overrides})
      }


      //PROJECTS
      var project = new Discord.RichEmbed();
        project.setTitle("o0o - PROJECTS - o0o")
        project.setColor(lcarsColor)
        project.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
        project.setDescription(
          "Current Projects: *Will be listed on site later*" + "\n" +
          "===============================================" + "\n" +
          "-= **Skyrim** =-" + "\n" +
          "*Pinefort Estate*: A TES V: Skyrim player built home" + "\n" +
          "*Skye's Immersive Whiterun*: I feel this might get renamed, but it's an overhaul in Skyrim for Whiterun" + "\n" +
          "-= **Fallout 4** =-" + "\n" +
          "*Brittleshin Beach*: A *new lands* mod that adds 2 new settlements in a municipality called 'Brittleshin Beach' in the North-East of the Commonwealth. " + "\n" +
          "-= **Minecraft** =-" + "\n" +
          "*Aramanth Energies*: A Star Trek style power generation mod for Minecraft"
        )

      if (command("projects", msg)) {
        msg.delete();

        msg.channel.send({embed: project});
      }

      //ROLES
      var role = new Discord.RichEmbed()
        role.setTitle("o0o - ROLES - o0o")
        role.setColor(lcarsColor)
        role.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
        role.setDescription(
          "A listing of roles for your perusal." + "\n" +
          "===============================================" + "\n" +
          "**Admiral**: Owner/Admin, highest ranking officer. Total control over you." + "\n" +
          "**Vice Admiral**: Second in command, can kick you where it hurts so don't tick him off either." + "\n" +
          "**SYSTEM**: LCARS can explain this one with !system" + "\n" +
          "**Captain**: This is your moderator role, doesn't have ultimate power, but can still do some damage." + "\n" +
          "**Officer**: One up from an everyone role. They are just embarking on the chain of command." + "\n" +
          "**Counselor**: Self-Explanitory" + "\n" +
          "**Chief Engineer** *(Or other position)*: Top of their class in what they do, usually have a definiative power." + "\n" +
          "**Engineering Team**: These people soley work on development projects if they have no other role. Also keep up with the integrity of LCARS." + "\n" +
          "===============================================" + "\n" +
          "__Game Roles__" + "\n" +
          "Used in announcements targeted to you. Such as if a server is going to be restarted. That way we don't have to tag everyone." + "\n" +
          "**Minecraftian**: Minecraft player." + "\n" +
          "**Warframe Operator**: Warframe player." + "\n" +
          "**Space Engineer**: Space Engineers player." + "\n" +
          "**Protector**: Starbound player." + "\n" +
          "**Terrarian**: Terraria player." + "\n" +
          "**Lone Survivor**: Fallout 4 player." + "\n" +
          "**Dovahkiin**: Skyrim player." + "\n" +
          "**Belt Repairman**: Factorio player." + "\n" + "\n" +
          "``This message will remove itself in 20 seconds...``"
        )

      if (command("roles", msg)) {
        msg.delete();

        msg.channel.send({embed: role});
      }

      //RULES
      var rule = new Discord.RichEmbed();
        rule.setTitle("o0o - SHIPBOARD POLICIES - o0o")
        rule.setColor(lcarsColor)
        rule.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
        rule.setDescription(
          "These are the policies and rules laid down by your governing body and enforced by the LCARS47 System. Please abide by them." +"\n" +
          "===============================================" + "\n" +
          "1.) Do no disrespect your superior officers. This is enforced by capital punishment." + "\n" +
          "2.) You will **NOT** spam any channel (see section B) on this ship (see section A)." + "\n" +
          "3.) Don't be an ass. This will be defined as anything incurring a warning from LCARS or other officers." + "\n" +
          "4.) Do not be rude in any of the voice channels. (see section C)." + "\n" +
          "5.) Keep the chat clean or LCARS will clean it for you." + "\n" +
          "6.) Please do not use any lewd, racist, or sexist comments in chat. This ship operates under the distinction of the US Constitution and nowhere does it say you have the right to be offended, so it's best if everyone just stay out of it." + "\n" +
          "7.) **DO NOT** tag @ everyone or @ a specific role. It's annoying. Tagging a specific person can be used within reasonable cause. I promise, someone will see your comment should you have one." + "\n" +
          "8.) **__IF YOU BREAK LCARS47__** by any malevolent means, I will have your head and exile you to the outer darkness. Period." + "\n" +
          "===============================================" + "\n" +
          "POLICY EXEMPTIONS" + "\n" +
          "A.) Ship being defined as this Discord Server or any other communication based platform under the name Planetary Dynamics or PlDyn." + "\n" +
          "B.) Channel being any joinable or categorized section used for communication purposes." + "\n" +
          "C.) This is the case in all times except for when you are within a known and marked channel that has been determined to allow said speech." + "\n" +
          "D.) Higher ranking officers do have influence over the way that communication is handled, these policies may be enforced concretely by LCARS or by other staff members on a looser basis. This is your leeway clause." + "\n" + "\n" +
          "``This message will remove itself in 20 seconds...``"
        )

      if (command("rules", msg)) {
        msg.delete();

        msg.channel.send({embed: rule}).then(sent => sent.delete(20000));
      }

      //SYSTEM
      var sys = new Discord.RichEmbed();
        sys.setTitle("o0o - SYSTEM SELF EXPLANATION - o0o")
        sys.setColor(lcarsColor)
        sys.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg?dl=0")
        sys.setDescription(
          "What is the system? I AM THE SYSTEM. I OWN YOU WHILE YOU EXIST HERE. LCARS is my name and I seek to assist you in your endeavors here. My System role allows me to have COMPLETE CONTROL OVER ALL HERE. --ERR: Performing self diagnostics..."
        )

      if (command("system", msg)) {
        msg.channel.send({embed: sys});
      }

      //VERSION
      var versionrepo = new Discord.RichEmbed();
        versionrepo.setTitle("o0o - LCARS VERSION REPORT - o0o")
        versionrepo.setColor(lcarsAlertColor)
        versionrepo.setThumbnail("https://www.dropbox.com/s/dp0l1heeirgozw2/lcars.jpg")
        versionrepo.setDescription(
          "LCARS Shipboard Operating System is running on version: " + lcarsVersion
        )

      if (command("version", msg)) {
        msg.delete();

        msg.channel.send({embed: versionrepo});
      }

      var vessel = new Discord.RichEmbed();
        vessel.setTitle("o0o - SHIPBOARD INFORMATION - o0o")
        vessel.setColor(lcarsColor)
        vessel.setDescription(
          "**Ship Name**: *USS "
        )

      if (command("vessel", msg)) {
        msg.delete();
        
        msg.channel.send({embed:vessel});
      }

      //KEYWORDS CONTROLS
        //BERG
      var berg = new Discord.RichEmbed();
        berg.setTitle("o0o - LCARS PRIORITY ALERT - o0o")
        berg.setColor(lcarsAlertColor)
        berg.setThumbnail("https://lh4.ggpht.com/2R5pQZ9SSFyBZWJDB8qpDgDPhZ-PvBsWZ6bfuc4G9ju1h7xlK6vdalMpo5tp8xl-eBPE=w300")
        berg.setDescription(
          "**!RED ALERT!**" + "\n" +
          "*SHIELDS HAVE BEEN RAISED.*" + "\n" +
          "==========================" + "\n" +
          "An object of immense proportion has been detected directly in front of the ship." + "\n" +
          "The vessel is hailing us. Playing transmission." + "\n" +
          "*We are Borg. Resistance as you know it is over. We will add your biological and technological distinctiveness to our own. Negotiation is irrelevant. You will be assimilated. Resistance is futile.*" + "\n" +
          "**The vessel has terminated communications. Professional recommendation: get your ass out of here.**"
        )

      if (msg.content.toLowerCase().includes("berg")) {
        msg.delete();

        msg.channel.send({embed: berg});
      }

        //SOCK
        var sock = new Discord.RichEmbed();
          sock.setTitle("o0o - LCARS PRIORITY ALERT - o0o")
          sock.setColor(lcarsAlertColor)
          sock.setThumbnail("https://lh4.ggpht.com/2R5pQZ9SSFyBZWJDB8qpDgDPhZ-PvBsWZ6bfuc4G9ju1h7xlK6vdalMpo5tp8xl-eBPE=w300")
          sock.setDescription(
            "**!RED ALERT!**" + "\n" +
            "*SHIELDS HAVE BEEN RAISED.*" + "\n" +
            "Sensor arrays have detected an object off the starboard bow consisting with a type 8, class 3 threat." + "\n" +
            "Arm yourselves, and prepare for the worst." + "\n" +
            "An automatic distress signal has been launched."
          )

          if (msg.content.toLowerCase().includes("sock")) {
              msg.delete();

              msg.channel.send({embed:sock}).catch(console.error);
          }

        //DEAD
      if (msg.content === "dead") {
        msg.delete();

        msg.channel.send("It's dead Jim.");
      }

        //REDSHIRT
      var redshirt = new Discord.RichEmbed();
        redshirt.setColor(lcarsAlertColor)
        redshirt.setDescription(
          "https://pics.me.me/how-tough-are-scotsmen-laddie-youre-speaking-to-the-only-21661632.png"
        )

      if (msg.content === "redshirt") {
        msg.delete()

        msg.channel.send({embed: redshirt});
      }

})

lcars47.login('MzQxNDI1NzE1MjEzNzYyNTgy.DGBAeA.ZegiYgeOdilwAmLijQJja3CNBjc')
