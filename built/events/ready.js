"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const readyEvent = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`Ready! Logged in as ${client?.user?.tag} ` + '😎👍');
        console.log(`Loaded ${client.commands.size} commands.`);
    },
};
exports.default = readyEvent;
// ALTERNATIVE TYPESCRIPT CODE? **DEPRECATED**
/* export default (client: Client): void => {
    client.on("ready", async () => {
        if (!client.user || !client.application) {
            return;
        }
        console.log(`Ready! Logged in as ${client.user.tag} ` + '😎👍');
    });
}; */
