import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../../types';
import { Users } from '../../models/dbObjects';
import logger from '../../utils/logger';

const balanceCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('balance')
		.setDescription('Check your current balance.'),
	async execute(client, interaction) {
		try {
			const userId = interaction.user.id;

			// Find or create user
			const [user] = await Users.findOrCreate({
				where: { user_id: userId },
				defaults: { user_id: userId, balance: 0 },
			});

			const balance = (user as any).balance;

			const embed = new EmbedBuilder()
				.setColor('#10B981')
				.setAuthor({
					name: interaction.user.username,
					iconURL: interaction.user.displayAvatarURL(),
				})
				.setTitle('Balance')
				.setDescription(`You have **${balance}** coins.`)
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
			logger.info(`${interaction.user.username} checked balance: ${balance}`);
		}
		catch (error) {
			logger.error('Balance command error:', error);
			await interaction.reply({
				content: 'Failed to check balance. Try again later.',
				ephemeral: true,
			});
		}
	},
};

export default balanceCommand;
