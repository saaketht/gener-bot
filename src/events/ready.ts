import { ActivityType } from 'discord.js';
import { DiscordClient } from '../types';
import { FlightTracker } from '../utils/flightTracker';
import logger from '../utils/logger';

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

		// initialize flight tracker and resume active flights
		try {
			client.flightTracker = new FlightTracker(client);
			await client.flightTracker.resumeAll();
		}
		catch (error) {
			logger.error('Failed to initialize flight tracker', { error });
		}
	},
};
export default readyEvent;