import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types';
import { getPongEmbed } from '../../embeds/embeds';

const pingCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with pong.'),
	async execute(client, interaction)	{
		await interaction.reply({
			embeds: [
				getPongEmbed(),
			],
		}).then(() => {
			console.log('Ping command executed.');
		})
			.catch(console.error);
	},
};

export default pingCommand;