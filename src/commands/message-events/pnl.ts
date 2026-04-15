import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import {
	parseTradesCSV,
	normalizeDate,
	getTodayDateStr,
	getPnlEmbed,
	getNoTradesEmbed,
} from '../../embeds/pnl-embeds';
import { getUniqueTradingDays, getDaySummary, buildRecapBlock } from '../../embeds/recap-embeds';
import { readTradesCSV } from '../../utils/tradeData';

function detailButton(dateStr: string): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`pnl_details_${dateStr}`)
			.setLabel('Show details')
			.setStyle(ButtonStyle.Secondary),
	);
}

const messageEvent: MessageEvent = {
	name: 'pnl',
	async execute(message) {
		if (message.author.bot) return;
		if (!message.content.toLowerCase().startsWith('pnl')) return;

		// Parse optional date: "pnl 3/21/2026" or "pnl" (defaults to today)
		const args = message.content.trim().split(/\s+/).slice(1);
		const requestedDate = args[0]
			? normalizeDate(args[0])
			: getTodayDateStr();

		try {
			if ('sendTyping' in message.channel) await message.channel.sendTyping();

			const csv = await readTradesCSV();
			const allTrades = parseTradesCSV(csv);
			const dayTrades = allTrades.filter(
				t => normalizeDate(t.date) === requestedDate,
			);

			if (dayTrades.length === 0) {
				let recapBlock: string | undefined;
				const recentDays = getUniqueTradingDays(allTrades).slice(0, 5);
				if (recentDays.length > 0) {
					const summaries = recentDays.map(date => {
						const dt = allTrades.filter(t => normalizeDate(t.date) === date);
						return getDaySummary(dt);
					});
					recapBlock = buildRecapBlock(summaries);
				}
				await message.reply({ embeds: [getNoTradesEmbed(requestedDate, recapBlock)] });
				return;
			}

			logger.info(`pnl: ${message.author.username} → ${requestedDate} (${dayTrades.length} trades)`);
			await message.reply({
				embeds: [getPnlEmbed(dayTrades, requestedDate)],
				components: [detailButton(requestedDate)],
			});
		}
		catch (error) {
			logger.error('pnl error:', error);
			await message.reply('Failed to read trade data.');
		}
	},
};

export default messageEvent;
