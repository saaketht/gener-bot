import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../../types';
import { CurrencyShop, Users } from '../../models/dbObjects';
import logger from '../../utils/logger';

const shopCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('shop')
		.setDescription('View the shop or buy an item.')
		.addStringOption(option =>
			option.setName('item')
				.setDescription('Item to buy (leave empty to view shop)')
				.setRequired(false),
		) as SlashCommandBuilder,
	async execute(client, interaction) {
		try {
			const itemName = interaction.options.getString('item');

			if (!itemName) {
				// Show shop
				const items = await CurrencyShop.findAll();

				if (items.length === 0) {
					await interaction.reply('The shop is empty!');
					return;
				}

				const itemList = items.map((item: any) =>
					`**${item.name}** - ${item.cost} coins`,
				).join('\n');

				const embed = new EmbedBuilder()
					.setColor('#8B5CF6')
					.setTitle('Shop')
					.setDescription(itemList)
					.setFooter({ text: 'Use /shop <item> to buy' })
					.setTimestamp();

				await interaction.reply({ embeds: [embed] });
				return;
			}

			// Buy item
			const item = await CurrencyShop.findOne({
				where: { name: itemName },
			});

			if (!item) {
				await interaction.reply({
					content: `Item "${itemName}" not found in shop.`,
					ephemeral: true,
				});
				return;
			}

			const userId = interaction.user.id;
			const [user] = await Users.findOrCreate({
				where: { user_id: userId },
				defaults: { user_id: userId, balance: 0 },
			});

			const cost = (item as any).cost;
			const balance = (user as any).balance;

			if (balance < cost) {
				const embed = new EmbedBuilder()
					.setColor('#EF4444')
					.setTitle('Insufficient Funds')
					.setDescription(`You need **${cost}** coins but only have **${balance}**.`)
					.setTimestamp();

				await interaction.reply({ embeds: [embed], ephemeral: true });
				return;
			}

			// Deduct balance
			const newBalance = balance - cost;
			await (user as any).update({ balance: newBalance });

			const embed = new EmbedBuilder()
				.setColor('#10B981')
				.setAuthor({
					name: interaction.user.username,
					iconURL: interaction.user.displayAvatarURL(),
				})
				.setTitle('Purchase Complete')
				.setDescription(`You bought **${(item as any).name}** for **${cost}** coins!\nRemaining balance: **${newBalance}** coins.`)
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
			logger.info(`${interaction.user.username} bought ${(item as any).name} for ${cost}`);
		}
		catch (error) {
			logger.error('Shop command error:', error);
			await interaction.reply({
				content: 'Failed to access shop. Try again later.',
				ephemeral: true,
			});
		}
	},
};

export default shopCommand;
