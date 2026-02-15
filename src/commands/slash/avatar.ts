import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../../types';
import { getAvatarEmbed } from '../../embeds/embeds';

const avatarCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('avatar')
		.setDescription('Get the avatar URL of the selected user, or your own avatar.')
		.addUserOption(option => option.setName('target').setDescription('The user\'s avatar to show')),
	async execute(client, interaction) {
		try {
			const user = interaction.options.getUser('target');
			// interaction.reply(interaction.createdTimestamp.toString());
			if (user) {
				await interaction.reply({
					embeds: [
						getAvatarEmbed(user),
					],
				}).then(() => {
					console.log('Server command executed.');
				})
					.catch(console.error);
			}
			else {
				await interaction.reply({
					embeds: [
						getAvatarEmbed(interaction.user),
					],
				}).then(() => {
					console.log('Server command executed.');
				})
					.catch(console.error);
			}
		}
		catch (error) {
			console.error('Avatar command failed to execute.', error);
		}
	},
};
export default avatarCommand;