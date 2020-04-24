// -- RethinkDB Connector --

const Rethink = require(`rethinkdb`);
const {botLog} = require(`../subs_log.js`);
const rAssets = require(`./assets.json`);

//Exports
module.exports = {
    db_connect,
    db_conduitStatus,
    db_query
}

async function db_connect() {
    botLog(`info`, `[LCARS-DB] Opening DB Conduit...`);

    let connection;

    await Rethink.connect({
        host: rAssets.db_host,
        port: rAssets.db_port,
        db: rAssets.db_db,
        user: rAssets.db_user,
        password: rAssets.db_pass
    }).then(conn => {
        botLog(`info`, `[LCARS-DB] Conduit Opened.`);
        connection = conn;
    }).error(error => {
        throw `DB Connection Failure.\n${error}`
    });

    return connection;
}

async function db_conduitStatus(connection) {
    botLog(`info`, `[LCARS-DB] Querying Status...`);

    let result = await Rethink.table(`Ops`).get(1).run(connection);
    
    if (result.Online) {
        botLog(`proc`, `[LCARS-DB] Reporting ONLINE.`);
        return "Online";
    } else {
        botLog(`warn`, `[LCARS-DB] Reporting OFFLINE.`);
        return "Offline";
    }
}

async function db_query(connection, table, key, value) {
    botLog(`info`, `[LCARS-DB] Dispatching Query...`);

    let currentOps = await Rethink.table(`Ops`).get(1).run(connection);
    await Rethink.table(`Ops`).update({id: 1, Queries: ++currentOps.Queries}).run(connection);

    switch (key) {
        case `select`:
            return await Rethink.table(table).get(value).run(connection);
        
        case `update`:
            return await Rethink.table(table).update(value).run(connection);

        case `insert`:
            return await Rethink.table(table).insert(value).run(connection);

        case `filter`:
            return await Rethink.table(table).filter(value).run(connection);

        default:
            throw `Invalid DB query!`
    }
}