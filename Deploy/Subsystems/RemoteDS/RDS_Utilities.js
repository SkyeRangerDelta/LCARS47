"use strict";
// ---- Remote Data Store Utilities ----
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//Imports
const mongodb_1 = require("mongodb");
const SysUtils_1 = __importDefault(require("../Utilities/SysUtils"));
//Globals
const client = new mongodb_1.MongoClient(process.env.RDS);
let database;
//Exports
exports.default = {
    rds_connect: async () => {
        SysUtils_1.default.log('info', 'Pending RDS connection...');
        return await client.connect();
    },
    rds_selectAll: async (connection, coll) => {
        SysUtils_1.default.log('info', 'Executing a bulk RDS transaction...');
        try {
            database = connection.db('LCARS47_DS');
        }
        catch (RDS_Err) {
            SysUtils_1.default.log('info', 'Error initializing RDS transaction!');
            return null;
        }
        //Do query update
        await database.collection('rds_status').updateOne({ id: 1 }, { $inc: { queries: 1 } });
        return await database.collection(coll).find({}).toArray();
    },
    rds_selectOne: async (connection, coll, documentId) => {
        SysUtils_1.default.log('info', 'Executing a specific RDS transaction...');
        try {
            database = connection.db('LCARS47_DS');
        }
        catch (RDS_Err) {
            SysUtils_1.default.log('info', 'Error initializing RDS transaction!');
            return null;
        }
        //Do query update
        await database.collection('rds_status').updateOne({ id: 1 }, { $inc: { queries: 1 } });
        return await database.collection(coll).findOne({ id: documentId });
    },
    rds_status: async (connection) => {
        SysUtils_1.default.log('info', 'Pending RDS status request...');
        const query = { id: 1 };
        let database;
        try {
            database = connection.db('LCARS47_DS');
        }
        catch (RDS_Err) {
            SysUtils_1.default.log('info', 'Error getting RDS status!');
            return 'OFFLINE';
        }
        const currentStatus = await database.collection('rds_status').findOne(query);
        if (!currentStatus) {
            return 'OFFLINE';
        }
        if (currentStatus.status) {
            SysUtils_1.default.log('info', 'RDS is Online.');
            return 'ONLINE';
        }
        else {
            return 'OFFLINE';
        }
    }
};
