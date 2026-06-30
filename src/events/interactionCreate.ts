import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Guild, Interaction, MessageFlags } from 'discord.js';
import { DiscordClient } from '../types';
import { rateLimiter } from '../utils/rateLimiter';
import logger from '../utils/logger';
import { parseTradesCSV } from '../embeds/pnl-embeds';
import { resolveAssetView, buildTimeframeRows, parseTimeframeCustomId } from '../embeds/asset-embeds';
import { resolveWatchlistView } from '../utils/watchlist';
import { getUniqueTradingDays, getRecapEmbed } from '../embeds/recap-embeds';

const interactionCreateEvent = {
	name: 'interactionCreate',
	async execute(interaction: Interaction) {
		const client = interaction.client as DiscordClient;

		// handle button interactions
		if (interaction.isButton()) {
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

			if (interaction.customId.startsWith('asset_tf_') || interaction.customId.startsWith('asset_refresh_') || interaction.customId.startsWith('asset_mode_')) {
				if (!rateLimiter(interaction.user.id, 'asset_tf', 8, 15000)) {
					await interaction.reply({ content: 'Slow down — try again in a few seconds.', flags: MessageFlags.Ephemeral });
					return;
				}

				const parsed = parseTimeframeCustomId(interaction.customId);
				if (!parsed) return;
				const { mode, range, type, symbol } = parsed;
				// Refresh bypasses the price/history cache for a genuinely live pull.
				const force = interaction.customId.startsWith('asset_refresh_');

				try {
					await interaction.deferUpdate();
					const result = await resolveAssetView(symbol, type, range, force, mode);
					if (!result) {
						logger.warn(`asset timeframe fetch returned null (${symbol} ${range})`);
						await interaction.followUp({
							content: `Couldn't load **${symbol}** for that timeframe — try another.`,
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					await interaction.editReply({
						embeds: [result.embed],
						files: result.files,
						components: buildTimeframeRows(symbol, type, range, mode),
					});
				}
				catch (error) {
					logger.error(`asset timeframe button failed (${interaction.customId})`, { error });
				}
				return;
			}

			if (interaction.customId.startsWith('watchlist_tf_') || interaction.customId.startsWith('watchlist_refresh_')) {
				if (!rateLimiter(interaction.user.id, 'asset_tf', 8, 15000)) {
					await interaction.reply({ content: 'Slow down — try again in a few seconds.', flags: MessageFlags.Ephemeral });
					return;
				}

				const force = interaction.customId.startsWith('watchlist_refresh_');
				const range = interaction.customId.slice((force ? 'watchlist_refresh_' : 'watchlist_tf_').length);

				// Tickers live in the user's original message (this button is on the bot's
				// reply), so re-parse the replied-to message — stateless, survives restarts.
				const refId = interaction.message.reference?.messageId;
				if (!refId || !interaction.guildId) return;

				try {
					await interaction.deferUpdate();
					const original = await interaction.channel?.messages.fetch(refId).catch(() => null);
					const payload = original
						? await resolveWatchlistView(original.content, interaction.guildId, range, force)
						: null;
					if (!payload) {
						await interaction.followUp({
							content: 'Couldn\'t refresh that watchlist — the original message may be gone.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					await interaction.editReply(payload);
				}
				catch (error) {
					logger.error(`watchlist button failed (${interaction.customId})`, { error });
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

		if (interaction.isAutocomplete()) {
			const command = client.commands.get(interaction.commandName);
			if (!command?.autocomplete) return;
			try {
				await command.autocomplete(client, interaction);
			}
			catch (error) {
				logger.warn(`autocomplete failed for ${interaction.commandName}`, { error });
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
