import { ActivityType } from 'discord.js';
import { DiscordClient } from '../types';

const readyEvent = {
	name: 'clientReady',
	once: true,
	async execute(client: DiscordClient) {
		client?.user?.setActivity({
			name: 'waframe',
			type: ActivityType.Streaming,
			url: 'https://www.twitch.tv/ripgpa9',
		});
		console.log(`ready, logged in at ${client?.user?.tag} ` + '👍');
	},
};
export default readyEvent;