import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Guild, Interaction, MessageFlags } from 'discord.js';
import { DiscordClient } from '../types';
import { rateLimiter } from '../utils/rateLimiter';
import logger from '../utils/logger';
import { parseTradesCSV, normalizeDate, getPnlEmbed } from '../embeds/pnl-embeds';
import { getUniqueTradingDays, getRecapEmbed } from '../embeds/recap-embeds';

const interactionCreateEvent = {
	name: 'interactionCreate',
	async execute(interaction: Interaction) {
		const client = interaction.client as DiscordClient;

		// handle button interactions
		if (interaction.isButton()) {
			if (interaction.customId.startsWith('pnl_details_')) {
				const dateStr = interaction.customId.replace('pnl_details_', '');
				const firstRow = interaction.message.components?.[0];
				const firstButton = 'components' in firstRow ? (firstRow as any).components?.[0] : null;
				const isDetailed = firstButton?.label === 'Hide details';

				try {
					await interaction.deferUpdate();
					const csvPath = process.env.PNL_CSV_PATH
						|| join(homedir(), 'rh-trade-exporter', 'outputs', 'spy_trades.csv');
					const csv = await readFile(csvPath, 'utf-8');
					const allTrades = parseTradesCSV(csv);
					const dayTrades = allTrades.filter(t => normalizeDate(t.date) === dateStr);

					const toggledDetail = !isDetailed;
					const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setCustomId(`pnl_details_${dateStr}`)
							.setLabel(toggledDetail ? 'Hide details' : 'Show details')
							.setStyle(ButtonStyle.Secondary),
					);

					await interaction.editReply({
						embeds: [getPnlEmbed(dayTrades, dateStr, toggledDetail)],
						components: [button],
					});
				}
				catch (error) {
					logger.error('Error handling pnl detail toggle', { error });
				}
				return;
			}

			if (interaction.customId.startsWith('recap_details_')) {
				const dayCount = parseInt(interaction.customId.replace('recap_details_', ''));
				const firstRow = interaction.message.components?.[0];
				const firstButton = 'components' in firstRow ? (firstRow as any).components?.[0] : null;
				const isDetailed = firstButton?.label === 'Hide details';

				try {
					await interaction.deferUpdate();
					const csvPath = process.env.PNL_CSV_PATH
						|| join(homedir(), 'rh-trade-exporter', 'outputs', 'spy_trades.csv');
					const csv = await readFile(csvPath, 'utf-8');
					const allTrades = parseTradesCSV(csv);

					if (getUniqueTradingDays(allTrades).length === 0) return;

					const toggledDetail = !isDetailed;
					const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setCustomId(`recap_details_${dayCount}`)
							.setLabel(toggledDetail ? 'Hide details' : 'Show details')
							.setStyle(ButtonStyle.Secondary),
					);

					await interaction.editReply({
						embeds: [getRecapEmbed(allTrades, dayCount, toggledDetail)],
						components: [button],
					});
				}
				catch (error) {
					logger.error('Error handling recap detail toggle', { error });
				}
				return;
			}

			if (interaction.customId.startsWith('flight_refresh_')) {
				const dbRowId = parseInt(interaction.customId.split('_')[2]);
				if (isNaN(dbRowId)) return;

				if (!rateLimiter(interaction.user.id, 'flight_refresh', 3, 30000)) {
					await interaction.reply({ content: 'Slow down — try again in a few seconds.', flags: MessageFlags.Ephemeral });
					return;
				}

				try {
					await interaction.deferUpdate();
					if (client.flightTracker) {
						await client.flightTracker.pollAndUpdate(dbRowId);
					}
				}
				catch (error) {
					logger.error(`Flight refresh button failed, row=${dbRowId}, user=${interaction.user.id}`, { error });
				}
			}
			return;
		}

		if (!interaction.isChatInputCommand()) return;
		const command = client.commands.get(interaction.commandName);

		if (!command) return;

		const guild: Guild | null = interaction.guild;
		if (!guild) return;

		try {
			await command.execute(client, interaction);
		}
		catch (error: any) {
			// interaction already expired — don't try to reply to a dead interaction
			if (error?.code === 10062) {
				logger.warn(`Interaction expired before response: ${interaction.commandName}, guild=${guild.id}`);
				return;
			}

			logger.error(`Command failed: ${interaction.commandName}, guild=${guild.id}`, { error });
			try {
				if (interaction.deferred || interaction.replied) {
					await interaction.editReply({ content: 'There was an error while executing this command!' });
				}
				else {
					await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
				}
			}
			catch {
				// interaction expired or already handled
			}
		}
	},
};

export default interactionCreateEvent;
