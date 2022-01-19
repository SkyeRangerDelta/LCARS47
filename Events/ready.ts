// -- READY EVENT --

//Imports

//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute
};

async function execute(LCARS47, args) {
    console.log('HE LIVES!\n' + LCARS47.uptime + '\n' + args.length);
}