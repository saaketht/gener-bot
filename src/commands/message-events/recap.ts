import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Message } from 'discord.js';
import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { parseTradesCSV, getNoTradesEmbed } from '../../embeds/pnl-embeds';
import {
	getUniqueTradingDays,
	getRecapEmbed,
	parseCashFlowJson,
	getCashFlowEmbed,
} from '../../embeds/recap-embeds';
import { readTradesCSV } from '../../utils/tradeData';

const CASH_FLOW_PATH = process.env.CASH_FLOW_JSONL_PATH
	|| join(homedir(), 'rh-trade-exporter', 'outputs', 'cash_flow.jsonl');

function detailButton(dayCount: number): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`recap_details_${dayCount}`)
			.setLabel('Show details')
			.setStyle(ButtonStyle.Secondary),
	);
}

async function handleRecap(message: Message, dayCount: number) {
	try {
		if ('sendTyping' in message.channel) await message.channel.sendTyping();

		const csv = await readTradesCSV();
		const allTrades = parseTradesCSV(csv);
		const days = getUniqueTradingDays(allTrades);

		if (days.length === 0) {
			await message.reply({ embeds: [getNoTradesEmbed('recent')] });
			return;
		}

		await message.reply({
			embeds: [getRecapEmbed(allTrades, dayCount)],
			components: [detailButton(dayCount)],
		});
	}
	catch (error) {
		logger.error('recap error:', error);
		await message.reply('Failed to read trade data.');
	}
}

async function handleCashFlow(message: Message) {
	try {
		if ('sendTyping' in message.channel) await message.channel.sendTyping();

		const raw = await readFile(CASH_FLOW_PATH, 'utf-8');
		const lines = raw.trim().split('\n').filter(Boolean);
		if (lines.length === 0) {
			await message.reply('No cash flow data yet — run `cash_flow.py --json` to generate.');
			return;
		}

		const lastLine = lines[lines.length - 1];
		const summary = parseCashFlowJson(lastLine);

		await message.reply({ embeds: [getCashFlowEmbed(summary)] });
	}
	catch (error) {
		logger.error('recap all error:', error);
		const msg = error instanceof Error && error.message.includes('ENOENT')
			? 'No cash flow data found — run `cash_flow.py --json` to generate.'
			: 'Failed to read cash flow data.';
		await message.reply(msg);
	}
}

const messageEvent: MessageEvent = {
	name: 'recap',
	async execute(message) {
		if (message.author.bot) return;
		if (!message.content.toLowerCase().startsWith('recap')) return;

		const args = message.content.trim().split(/\s+/).slice(1);

		if (args[0]?.toLowerCase() === 'all') {
			await handleCashFlow(message);
			return;
		}

		const dayCount = args[0] ? parseInt(args[0]) : 5;
		if (isNaN(dayCount) || dayCount < 1 || dayCount > 30) {
			await message.reply('Usage: `recap [days]` or `recap all`');
			return;
		}

		await handleRecap(message, dayCount);
	},
};

export default messageEvent;
