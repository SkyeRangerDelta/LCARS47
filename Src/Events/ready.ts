// -- READY EVENT --

//Imports
import Utility from '../Subsystems/Utilities/SysUtils';


//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute: async () => {
        Utility.log('proc', '[CLIENT] IM ALIVE!');
    }
};