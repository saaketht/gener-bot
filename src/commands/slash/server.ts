import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types';
import { getServerEmbed } from '../../embeds/embeds';
// import chalk from index.ts

const serverCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('server')
		.setDescription('Replies with server info!'),
	async execute(client, interaction) {
		try {
			await interaction.reply({
				embeds: [
					getServerEmbed(interaction),
				],
			}).then(() => {
				console.log('Server command executed.');
			})
				.catch(console.error);
		}
		catch (error) {
			console.error('Server command failed to execute.', error);
		}
	},
};
export default serverCommand;