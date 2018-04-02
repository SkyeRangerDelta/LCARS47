const Command = class Command {
    constructor ({ name, description, parameters, run}) {
        this.name = name
        this.description = description
        this.parameters = parameters
        this.run = run
    }
}

module.exports = Command