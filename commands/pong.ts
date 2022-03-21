import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../@types/bot';
import { getPingEmbed } from '../embeds/embeds';

const pongCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('pong')
		.setDescription('Replies with ping.'),
	async execute(client, interaction)	{
		await interaction.reply({
			embeds: [
				getPingEmbed(),
			],
		});
	},
};
export default pongCommand;