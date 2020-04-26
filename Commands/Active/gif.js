//----GIF----

const subsystems = require(`../../Subsystems/subs_ops/subs_settings.json`);
const got = require(`got`);

module.exports = {
    run,
    help
}

async function run(lcars, msg, cmd) {
    msg.delete();

    let searchTerm = cmd.splice(0).join(` `);

    var response = await got (`https://api.tenor.com/v1/random?key=${subsystems.tenorAPI}&contentfilter=off&q=${searchTerm}&locale=en_US`, {json: true}).catch(console.error);

    console.log(response);

    if (!response || !response.body || !response.body.results) {
        return msg.reply(`Search failed.`);
    }

    msg.channel.send(`${response.body.results[0].itemurl}`);
}

function help() {
    return `Displays a random GIF. (Optional search term will narrow results).`;
}