const Command = require('./Command.js');

module.exports = new Command({
    name: 'status',
    description: 'Reports the status of LCARS47',
    parameters: '',
    run: async ({msg, lcars}) => {
        return('LCARS47 is `online`.');
    }
})