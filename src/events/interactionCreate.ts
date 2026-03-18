import { Guild, Interaction } from 'discord.js';
import { DiscordClient } from '../types';
import { rateLimiter } from '../utils/rateLimiter';
import logger from '../utils/logger';

const interactionCreateEvent = {
	name: 'interactionCreate',
	async execute(interaction: Interaction) {
		const client = interaction.client as DiscordClient;

		// handle button interactions
		if (interaction.isButton()) {
			if (interaction.customId.startsWith('flight_refresh_')) {
				const dbRowId = parseInt(interaction.customId.split('_')[2]);
				if (isNaN(dbRowId)) return;

				if (!rateLimiter(interaction.user.id, 'flight_refresh', 3, 30000)) {
					await interaction.reply({ content: 'Slow down — try again in a few seconds.', ephemeral: true });
					return;
				}

				try {
					await interaction.deferUpdate();
					if (client.flightTracker) {
						await client.flightTracker.pollAndUpdate(dbRowId);
					}
				}
				catch (error) {
					logger.error('Error handling flight refresh button', { error });
				}
			}
			return;
		}

		if (!interaction.isChatInputCommand()) return;
		const command = client.commands.get(interaction.commandName);

		if (!command) return;

		const guild: Guild | null = interaction.guild;
		if (!guild) return;

		try {
			await command.execute(client, interaction);
		}
		catch (error) {
			console.error(`[${guild.id}]`, error);
			await interaction.reply({
				content: 'There was an error while executing this command!',
				ephemeral: true,
			});
		}
	},
};

export default interactionCreateEvent;
