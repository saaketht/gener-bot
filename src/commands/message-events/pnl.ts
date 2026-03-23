import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
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

const CSV_PATH = process.env.PNL_CSV_PATH
	|| join(homedir(), 'rh-trade-exporter', 'outputs', 'spy_trades.csv');

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

			const csv = await readFile(CSV_PATH, 'utf-8');
			const allTrades = parseTradesCSV(csv);
			const dayTrades = allTrades.filter(
				t => normalizeDate(t.date) === requestedDate,
			);

			if (dayTrades.length === 0) {
				await message.reply({ embeds: [getNoTradesEmbed(requestedDate)] });
				return;
			}

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
