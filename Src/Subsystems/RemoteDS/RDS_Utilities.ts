// ---- Remote Data Store Utilities ----

// Imports
import { MongoClient } from 'mongodb';
import Utility from '../Utilities/SysUtils.js';
import { type RDSStatus, type StatusInterface } from '../Auxiliary/Interfaces/StatusInterface.js';

// Globals
if ( process.env.RDS == null ) {
  throw new Error( 'RDS connection string is missing.' );
}
const client = new MongoClient( process.env.RDS );

let database;

// Exports
export default {
  rds_connect: async () => {
    Utility.log( 'info', 'Pending RDS connection...' );

    return await client.connect();
  },
  rds_selectAll: async ( connection: MongoClient, coll: string ) => {
    Utility.log( 'info', 'Executing a bulk RDS transaction...' );

    try {
      database = connection.db( 'LCARS47_DS' );
    }
    catch {
      Utility.log( 'info', 'Error initializing RDS transaction!' );
      return null;
    }

    // Do query update
    await database.collection( 'rds_status' ).updateOne( { id: 1 }, { $inc: { QUERIES: 1 } } );

    return await database.collection( coll ).find( {} ).toArray();
  },
  rds_selectOne: async ( connection: MongoClient, coll: string, documentId: number ) => {
    Utility.log( 'info', 'Executing a specific RDS transaction...' );

    try {
      database = connection.db( 'LCARS47_DS' );
    }
    catch {
      Utility.log( 'info', 'Error initializing RDS transaction!' );
      return null;
    }

    // Do query update
    await database.collection( 'rds_status' ).updateOne( { id: 1 }, { $inc: { QUERIES: 1 } } );

    return await database.collection( coll ).findOne( { id: documentId } );
  },
  rds_update: async ( connection: MongoClient, collection: string, filter: object, value: object ): Promise<boolean> => {
    Utility.log( 'info', '[RDS] Updating a record.' );

    let database;

    try {
      database = connection.db( 'LCARS47_DS' );
    }
    catch {
      Utility.log( 'warn', '[RDS] Failed to get RDS DB Connection!' );
      throw new Error( 'Invalid RDS state.' );
    }

    await database.collection( 'rds_status' ).updateOne( { id: 1 }, { $inc: { QUERIES: 1 } } );
    const res = await database.collection( collection ).updateOne( filter, value );
    return res.modifiedCount === 1;
  },
  rds_status: async ( connection: MongoClient ): Promise<string> => {
    Utility.log( 'info', 'Pending RDS status request...' );

    const query = { id: 1 };
    let database;

    try {
      database = connection.db( 'LCARS47_DS' );
    }
    catch {
      Utility.log( 'info', 'Error getting RDS status!' );
      return 'OFFLINE';
    }

    const currentStatus = await database.collection( 'rds_status' ).findOne( query );

    if ( currentStatus == null ) {
      return 'OFFLINE';
    }

    const rdsObject = currentStatus as unknown as RDSStatus; // TODO: JANKY
    if ( rdsObject.STATE ) {
      Utility.log( 'info', 'RDS is Online.' );
      return 'ONLINE';
    }
    else {
      return 'OFFLINE';
    }
  },
  rds_getStatusFull: async ( connection: MongoClient ): Promise<StatusInterface> => {
    Utility.log( 'info', '[RDS] Grabbing latest bot state data.' );

    const query = { id: 1 };
    let database;

    try {
      database = connection.db( 'LCARS47_DS' );
    }
    catch {
      Utility.log( 'warn', '[RDS] Failed to get RDS Connection!' );
      throw new Error( 'Invalid RDS State!' );
    }

    const BotStateRes = await database.collection( 'rds_status' ).findOne( query );
    if ( BotStateRes == null ) throw new Error( 'Failed to get bot status!' );

    return BotStateRes as unknown as StatusInterface;
  }
};
