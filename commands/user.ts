import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../@types/bot';
import { getUserEmbed } from '../embeds/embeds';

const userCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('user')
		.setDescription('Replies with user info!'),
	async execute(client, interaction) {
		await interaction.reply({
			embeds: [
				getUserEmbed(interaction),
			],
		});
	},
};
export default userCommand;

//  DEPRECATED VANILLA JAVASCRIPT CODE
/*  module.exports = {
	data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Replies with user info!'),
    async execute(interaction) {
        await interaction.reply(`Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`);
	},
};  */