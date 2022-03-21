import { DiscordClient } from '../@types/bot';

const readyEvent = {
	name: 'ready',
	once: true,
	execute(client: DiscordClient) {
		console.log(`Ready! Logged in as ${client?.user?.tag} ` + '😎👍');
		console.log(`Loaded ${client.commands.size} commands.`);
	},
};
export default readyEvent;

// ALTERNATIVE TYPESCRIPT CODE? **DEPRECATED**
/* export default (client: Client): void => {
    client.on("ready", async () => {
        if (!client.user || !client.application) {
            return;
        }
		console.log(`Ready! Logged in as ${client.user.tag} ` + '😎👍');
    });
}; */
