/////////////////////////////////////////////
//              LCARS47
//   The Official PlDyn Discord Bot
//
//      Developed and Maintained
//          By SkyeRangerDelta
//-------------------------------------------
//      See https://pldyn.net
//  And blog: https://cf.pldyn.net/
//
//  This is a custom bot designed for the
//      Planetary Dynamics Development
//              Community
/////////////////////////////////////////////

// -- DEPENDENCIES --
//Libraries
const Discord = require(`discord.js`);
const fs = require(`fs`);

//Functions
const {botLog} = require(`./Subsystems/subs_log`);
const {
    db_connect,
    db_conduitStatus,
    db_query
} = require(`./Subsystems/subs_DB/subs_dbHandler`);
const {
    insertNewMember
} = require(`./Subsystems/subs_DB/subs_memberOps`);

//Ops
const ops_Login = require(`./Subsystems/subs_Ops/Core/login.json`);
const ops_Channels = require(`./Subsystems/subs_Ops/subs_channels.json`);
const ops_Settings = require(`./Subsystems/subs_Ops/subs_settings.json`);

//Utility
const {
    statusReader,
    rewriteDate,
    rewriteTime,
    rewriteDateTime,
    convertMs,
    convertMSFUll
} = require(`./Subsystems/subs_Utility/subs_utility`);

//GLOBALS
const LCARS47 = new Discord.Client();

//Bot Variables
LCARS47.dbConnection = null;
LCARS47.dbState = null;
LCARS47.systemStart = new Date();
LCARS47.systemStartNow = Date.now();
LCARS47.session = null;
LCARS47.lastSystemStart = null;

//Guild & Channels
let gd_PlDyn;
let guildName;
let ch_EngineeringDeck;


// -- EVENT HANDLERS --
//Online and Functioning
LCARS47.on('ready', async () => {
    botLog(`proc`, `[CLIENT] CORE ONLINE.\n---------------------------------------`);

    // -- Perform Startup Routine --
    //Query Database Connection
    try {
        LCARS47.dbConnection = await db_connect();
        LCARS47.dbState = await db_conduitStatus(LCARS47.dbConnection);
    } catch (error) {
        botLog(`err`, `[LCARS-DB] Fault in startup sequence.\n${error}`);
    }

    //Initialize Channels & Guilds
    gd_PlDyn = LCARS47.guilds.cache.get(ops_Channels.pldyn);
    guildName = gd_PlDyn.name;
    ch_EngineeringDeck = LCARS47.channels.cache.get(ops_Channels.engdeck);

    //Update Ops Table
    let opsPreUpdate = await db_query(LCARS47.dbConnection, `Ops`, `select`, 1);

    LCARS47.session = ++opsPreUpdate.Session;

    LCARS47.lastSystemStart = convertMSFUll(opsPreUpdate.UTCStartup - LCARS47.systemStartNow);

    let opsTableUpdate = {
        id: 1,
        Online: true,
        Session: LCARS47.session,
        Startup: `${rewriteDateTime(LCARS47.systemStart)}`,
        UTCStartup: `${LCARS47.systemStartNow}`
    };

    let opsPostUpdate = await db_query(LCARS47.dbConnection, `Ops`, `update`, opsTableUpdate);

    if (opsPostUpdate.replaced != 1){
        botLog(`warn`, `[LCARS-DB] Ops table update failed. Replaced records not equal to 1.`);
    } else {
        botLog(`info`, `[LCARS-DB] Ops table update done.`);
    }

    //Dispatch Startup Message
    let startupPanel = new Discord.MessageEmbed();
        startupPanel.setTitle(`-[]- LCARS47 SYSTEM BOOT -[]-`);
        startupPanel.setDescription(
            `Performing system startup sequence.\n`+
            `Isolinear storage drives mounted.\n`+
            `Core systems initialized.`
        );
        startupPanel.addField(`Vessel Name`, guildName, false);
        startupPanel.addField(`Vessel Launch Date`, rewriteDate(gd_PlDyn.createdAt), true);
        startupPanel.addField(`Vessel Captain`, gd_PlDyn.owner.nickname, true);
        startupPanel.addField(`Vessel Crew Compliment`, gd_PlDyn.memberCount, false);
        startupPanel.addField(`Vessel Structural Compliment`, `${gd_PlDyn.channels.cache.size} Channels`, false);
        startupPanel.addField(`Galactic Sector (Shard)`, `ID: ${gd_PlDyn.shardID}\nStatus: ${statusReader(gd_PlDyn.shard.status)}`, true);
        startupPanel.addField(`Origin Region`, gd_PlDyn.region, true);
        startupPanel.addField(`System Session`, LCARS47.session, true);
        startupPanel.addField(`Time Since Last Start`, LCARS47.lastSystemStart, true);
        startupPanel.setColor(ops_Settings.color);
        startupPanel.setFooter(`Sequence Initialized at ${rewriteDateTime(LCARS47.systemStart)}`);
        startupPanel.setThumbnail(`https://pldyn.net/wp-content/uploads/2019/12/PlDynLogoPrimary.png`);

    ch_EngineeringDeck.send({embed: startupPanel});

});

//Error
LCARS47.on('error', async (err) => {
    botLog(`err`, `[CLIENT] ${err}`);
});

//Warnings
LCARS47.on('warn', async (warnInfo) => {
    botLog(`warn`, `[CLIENT] ${warnInfo}`);
});

//Message
LCARS47.on('message', async (msg) => {
    if (msg.author == LCARS47.user) return;
    if (msg.author.bot) return;

    //Member Statistics
    let memberCheck = await db_query(LCARS47.dbConnection, `Member_Ops`, `select`, `${msg.author.id}`);

    if (memberCheck.size == 1) {
        botLog(`info`, `[MEMBER-STATS] Member ops record found.`);

    } else if (memberCheck.size > 1) {
        botLog(`warn`, `[MEMBER-STATS] Multiple member ops records found.`);
        return msg.reply(`Multiple record entries found. Notify system administrator before continuing.`);

    } else {
        botLog(`info`, `[MEMBER-STATS] No member ops record found; attempting to create one...`);

        let memberObj = {
            id: msg.author.id,
            nickname: msg.member.nickname,
            acAttempts: 0,
            acSuccess: 0,
            pcSuccess: 0,
            suggestionsOpened: 0
        }

        let newRecordResponse = await insertNewMember(LCARS47, memberObj)

        if (newRecordResponse) {
            botLog(`proc`, `[MEMBER-STATS] New member ops record added.`);
        } else {
            botLog(`warn` `[MEMBER-STATS] Something wrong occured whilst attempting to create new record...\n${newRecordResponse}`)
        }
    }

    //Collect member ops record
    let cmdOpsUpdateOld = await db_query(LCARS47.dbConnection, `Member_Ops`, `select`, `${msg.author.id}`);

    //Command Handler
    let cmd = msg.content.toLowerCase().substring(1, msg.content.length).split(`-`);
    let cmdID = cmd.shift().trim();

    if (msg.content.startsWith(`${ops_Settings.prefix}`)) { //Active Cmd

        botLog(`info`, `[ACTIVE-CMD] Attempting to process active command...`);

        try {
            const cmdFile = require(`./Commands/Active/${cmdID}`);
            cmdFile.run(LCARS47, msg, cmd);

            //Log success
            botLog(`info`, `[ACTIVE-CMD] Success.`);
            let cmdOpsUpdateNew = await db_query(LCARS47.dbConnection, `Member_Ops`, `update`, ++cmdOpsUpdateOld.acSuccess)
        } catch (activeCmdErr) {
            botLog(`warn`, `[ACTIVE-CMD] Command execution failed.\n${activeCmdErr}\n---------------------------------------------------------------------`);

            //Execution failed, retry without potential spaces - first word as ID
            let cmdID2 = cmdID.split(` `).shift();
            botLog(`warn`, `[ACTIVE-CMD] [2nd Iteration] Attempting again with ID: ${cmdID2}`);

            try {
                const cmdFile2 = require(`./Commands/Active/${cmdID2}`);
                cmdFile2.run(LCARS47, msg, cmd);

                //Log Success
                botLog(`info`, `[ACTIVE-CMD] [2nd Iteration] Success.`);
                let cmdOpsUpdateNew = await db_query(LCARS47.dbConnection, `Member_Ops`, `update`, ++cmdOpsUpdateOld.acSuccess)
            } catch (activeCmdErr2) {
                botLog(`err`, `[ACTIVE-CMD] [2nd Iteration] Command execution failed.\n${activeCmdErr2}`);
            }
        }
    } else { //Potential passive command
        try {
            const passFile = require(`./Commands/Passive/${msg.content}`);
            passFile.run(msg);

            //Log success
            let pcOpsUpdateNew = await db_query(LCARS47.dbConnection, `Member_Ops`, `update`, ++cmdOpsUpdateOld.pcSuccess);
        } catch (passiveCmdErr) {
            botLog(`info`, `[PASSIVE-CMD] No passive found or failed.`);
        }
    }
})

//Execute Login
LCARS47.login(ops_Login.login);