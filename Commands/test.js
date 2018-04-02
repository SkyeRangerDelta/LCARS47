const Command = require('./Command.js');

module.exports = new Command({
    name: 'Test',
    description: 'This is a test command.',
    parameters: '',
    run: async ({msg, lcars}) => {
        return 'Test succeeded.'
    }
})