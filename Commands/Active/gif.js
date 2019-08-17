//----GIF----

const subsystems = require('../../Subsystems/lcars_subsystem.json');
const got = require('got');

exports.run = async (lcars, msg, cmd) => {
    msg.delete();

    let searchTerm = cmd.splice(0).join(' ');

    var response = await got (`https://api.tenor.com/v1/random?key=${subsystems.tenorAPI}&contentfilter=off&q=${searchTerm}&locale=en_US`, {json: true}).catch(console.error);

    console.log(response);

    if (!response || !response.body || !response.body.results) {
        return msg.reply("Search failed.");
    }

    msg.channel.send(`${response.body.results[0].itemurl}`);
}