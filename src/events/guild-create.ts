import { Guild } from 'discord.js';
import { DiscordEvent } from '../types';

const guildCreateEvent: DiscordEvent = {
	name: 'guildCreate',
	async execute(guild: Guild) {
		console.log(`Joined a new guild: ${guild.name} - ${guild.id}`);
	},
};
export default guildCreateEvent;