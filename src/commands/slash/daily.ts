import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../../types';
import { Users } from '../../models/dbObjects';
import logger from '../../utils/logger';

const DAILY_AMOUNT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const dailyCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('daily')
		.setDescription('Claim your daily coins.'),
	async execute(client, interaction) {
		try {
			const userId = interaction.user.id;
			const now = new Date();

			// Find or create user
			const [user] = await Users.findOrCreate({
				where: { user_id: userId },
				defaults: { user_id: userId, balance: 0, last_daily_claim: null },
			});

			// Check cooldown from database
			const lastClaim = (user as any).last_daily_claim;
			if (lastClaim) {
				const lastClaimTime = new Date(lastClaim).getTime();
				const timeSince = now.getTime() - lastClaimTime;

				if (timeSince < DAY_MS) {
					const remainingMs = DAY_MS - timeSince;
					const hours = Math.floor(remainingMs / (60 * 60 * 1000));
					const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

					const embed = new EmbedBuilder()
						.setColor('#EF4444')
						.setTitle('Daily Cooldown')
						.setDescription(`You already claimed your daily!\nCome back in **${hours}h ${minutes}m**.`)
						.setTimestamp();

					await interaction.reply({ embeds: [embed], ephemeral: true });
					return;
				}
			}

			// Add coins and update last claim time
			const newBalance = (user as any).balance + DAILY_AMOUNT;
			await (user as any).update({
				balance: newBalance,
				last_daily_claim: now,
			});

			const embed = new EmbedBuilder()
				.setColor('#10B981')
				.setAuthor({
					name: interaction.user.username,
					iconURL: interaction.user.displayAvatarURL(),
				})
				.setTitle('Daily Reward')
				.setDescription(`You received **${DAILY_AMOUNT}** coins!\nNew balance: **${newBalance}** coins.`)
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
			logger.info(`${interaction.user.username} claimed daily: +${DAILY_AMOUNT}, total: ${newBalance}`);
		}
		catch (error) {
			logger.error('Daily command error:', error);
			await interaction.reply({
				content: 'Failed to claim daily. Try again later.',
				ephemeral: true,
			});
		}
	},
};

export default dailyCommand;
