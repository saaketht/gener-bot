import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../@types/bot';
import { getPongEmbed } from '../embeds/embeds';

const pingCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with pong.'),
	async execute(client, interaction)	{
		await interaction.reply({
			embeds: [
				getPongEmbed(),
			],
		});
	},
};
export default pingCommand;

// DEPRECATED VANILLA JAVASCRIPT CODE
/* module.exports = {
	data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
	async execute(interaction) {
		await interaction.reply('Pong!');
	},
}; */