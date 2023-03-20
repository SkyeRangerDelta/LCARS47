// -- Status Interface --

//Imports

//Exports
export interface StatusInterface extends Object {
    STATE: boolean;
    VERSION: string;
    SESSION: number;
    STARTUP_TIME: string;
    STARTUP_UTC: number;
    QUERIES: number;
    CMD_QUERIES: number;
    CMD_QUERIES_FAILED: number;
}