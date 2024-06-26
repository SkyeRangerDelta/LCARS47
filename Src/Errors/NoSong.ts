// -- No Song Error --
// Describes a simple stream song not found error

import Utility from '../Subsystems/Utilities/SysUtils.js';

export class NoSongErr extends Error {
  constructor ( errMsg: string ) {
    super( errMsg );
    Object.setPrototypeOf( this, NoSongErr.prototype );

    Utility.log( 'err', '[No Song Error] ' + errMsg );
  }
}
