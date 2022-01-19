// -- READY EVENT --
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
//Imports
//Exports
module.exports = {
    name: 'ready',
    once: true,
    execute
};
function execute(LCARS47, args) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('HE LIVES!\n' + LCARS47.uptime + '\n' + args.length);
    });
}
//# sourceMappingURL=ready.js.map