import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../@types/bot';
import { getAvatarEmbed } from '../embeds/embeds';

const avatarCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('avatar')
		.setDescription('Get the avatar URL of the selected user, or your own avatar.')
		.addUserOption(option => option.setName('target').setDescription('The user\'s avatar to show')),
	async execute(client, interaction) {
		const user = interaction.options.getUser('target');
		if (user) {
			await interaction.reply({
				embeds: [
					getAvatarEmbed(user),
				],
			});
		}
	},
};
export default avatarCommand;