// ---- Remote Data Store Utilities ----

//Imports
import {Filter, MongoClient} from "mongodb";
import Utility from "../Utilities/SysUtils";

//Globals
const client = new MongoClient(process.env.RDS as string);

let database;

interface transObj {
    coll: string,
    key: string,
    value: Filter<any>,
    filter: Filter<any>,
    aFilter: string
}

//Exports
export default {
    rds_connect: async () => {
        Utility.log('info', 'Pending RDS connection...');

        return await client.connect();
    },
    rds_selectAll: async (connection: MongoClient, coll: string) => {
        Utility.log('info', 'Executing a bulk RDS transaction...');

        try {
            database = connection.db('LCARS47_DS');
        }
        catch (RDS_Err) {
            Utility.log('info', 'Error initializing RDS transaction!');
            return null;
        }

        //Do query update
        await database.collection('rds_status').updateOne({id: 1}, {$inc: {queries: 1}});

        return await database.collection(coll).find({}).toArray();
    },
    rds_selectOne: async (connection: MongoClient, coll: string, documentId: number) => {
        Utility.log('info', 'Executing a specific RDS transaction...');

        try {
            database = connection.db('LCARS47_DS');
        }
        catch (RDS_Err) {
            Utility.log('info', 'Error initializing RDS transaction!');
            return null;
        }

        //Do query update
        await database.collection('rds_status').updateOne({id: 1}, {$inc: {queries: 1}});

        return await database.collection(coll).findOne({id: documentId});
    },
    rds_status: async (connection: MongoClient): Promise<string> => {
        Utility.log('info', 'Pending RDS status request...');

        const query = {id: 1};
        let database;

        try {
            database = connection.db('LCARS47_DS');
        }
        catch (RDS_Err) {
            Utility.log('info', 'Error getting RDS status!');
            return 'OFFLINE';
        }

        const currentStatus = await database.collection('rds_status').findOne(query);

        if (!currentStatus) {
            return 'OFFLINE';
        }

        if (currentStatus.status) {
            Utility.log('info', 'RDS is Online.');
            return 'ONLINE';
        }
        else {
            return 'OFFLINE';
        }
    }
}