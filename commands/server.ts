import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../@types/bot';
import { getServerEmbed } from '../embeds/embeds';

const serverCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('server')
		.setDescription('Replies with server info!'),
	async execute(client, interaction) {
		await interaction.reply({
			embeds: [
				getServerEmbed(interaction),
			],
		});
	},
};
export default serverCommand;

// DEPRECATED VANILLA JAVASCRIPT CODE
/*  module.exports = {
      data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('Replies with server info!'),
    async execute(interaction) {
		await interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
    },
};  */
