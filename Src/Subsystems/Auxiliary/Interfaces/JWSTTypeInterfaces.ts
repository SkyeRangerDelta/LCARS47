/**
 * Interface type definitions for JWST API
 */

/**
 * Interface for JWST API request
 * @interface JWST_Request
 * @property {number} statusCode - HTTP status code of the response
 * @property {string} body - Body of the response
 */
export interface JWST_Request {
  statusCode: number;
  body: string;
}

/**
 * Interface for JWST API request end data
 * @interface JWST_Request_Data
 * @property {string} file_type - Type of the file
 * @property {string} program - Program of the request
 * @property {string} id - ID of the request
 * @property {string} details - Details of the request
 * @property {string} location - Location of the request
 */
export interface JWST_Request_Data {
  body: JWST_Request_Data_Body[];
}

export interface JWST_Request_Data_Body {
  file_type: string;
  program: string;
  id: string;
  details: {
    description: string;
  };
  location: string;
}
