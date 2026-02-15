import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types';
import { getUserEmbed } from '../../embeds/embeds';

const userCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('user')
		.setDescription('Replies with user info!'),
	async execute(client, interaction) {
		await interaction.reply({
			embeds: [
				getUserEmbed(interaction),
			],
		}).then(() => {
			console.log('User command executed.');
		})
			.catch(console.error);
	},
};

export default userCommand;