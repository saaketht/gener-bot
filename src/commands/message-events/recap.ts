import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Message } from 'discord.js';
import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { parseTradesCSV, getNoTradesEmbed } from '../../embeds/pnl-embeds';
import {
	getUniqueTradingDays,
	getRecapEmbed,
	parseCashFlowJson,
	getCashFlowEmbed,
	CashFlowSummary,
} from '../../embeds/recap-embeds';

const CSV_PATH = process.env.PNL_CSV_PATH
	|| join(homedir(), 'rh-trade-exporter', 'outputs', 'spy_trades.csv');

const CASH_FLOW_SCRIPT = process.env.CASH_FLOW_SCRIPT_PATH
	|| (process.env.NODE_ENV === 'prod'
		? '/home/gener/rh-trade-exporter/cash_flow.py'
		: join(homedir(), 'rh-trade-exporter', 'cash_flow.py'));

// In-memory cache for cash flow data (30 min TTL)
let cashFlowCache: { data: CashFlowSummary; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

function detailButton(dayCount: number): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`recap_details_${dayCount}`)
			.setLabel('Show details')
			.setStyle(ButtonStyle.Secondary),
	);
}

function runCashFlow(): Promise<string> {
	const venvPython = join(dirname(CASH_FLOW_SCRIPT), '.venv', 'bin', 'python3');
	return new Promise((resolve, reject) => {
		execFile(venvPython, [CASH_FLOW_SCRIPT, '--json'], { timeout: 30_000 }, (err, stdout, stderr) => {
			if (err) {
				const msg = stderr || stdout || err.message;
				if (msg.includes('Token expired') || msg.includes('.rh_token')) {
					reject(new Error('Robinhood token expired — run `hood.py --save-token` to refresh.'));
				}
				else {
					reject(new Error(msg));
				}
				return;
			}
			resolve(stdout);
		});
	});
}

async function handleRecap(message: Message, dayCount: number) {
	try {
		if ('sendTyping' in message.channel) await message.channel.sendTyping();

		const csv = await readFile(CSV_PATH, 'utf-8');
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

		if (cashFlowCache && Date.now() - cashFlowCache.ts < CACHE_TTL) {
			await message.reply({ embeds: [getCashFlowEmbed(cashFlowCache.data)] });
			return;
		}

		const stdout = await runCashFlow();
		const summary = parseCashFlowJson(stdout);
		cashFlowCache = { data: summary, ts: Date.now() };

		await message.reply({ embeds: [getCashFlowEmbed(summary)] });
	}
	catch (error) {
		logger.error('recap all error:', error);
		const msg = error instanceof Error ? error.message : 'Failed to fetch cash flow data.';
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
