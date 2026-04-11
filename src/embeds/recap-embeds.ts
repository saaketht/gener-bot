import { EmbedBuilder } from 'discord.js';
import {
	Trade,
	normalizeDate,
	formatDateHuman,
	groupTrades,
	sortTrades,
	buildTradeBlock,
	buildWinBar,
	fmtDollars,
	fmtPct,
} from './pnl-embeds';

// --- Interfaces ---

export interface DaySummary {
	date: string;
	pnl: number;
	pnlPct: number;
	wins: number;
	losses: number;
	tradeCount: number;
	totalRisk: number;
}

export interface CashFlowSummary {
	deposits: number;
	withdrawals: number;
	netDeposited: number;
	goldFees: number;
	dividends: number;
	referralGrants: number;
	netCashBasis: number;
	currentEquity: number;
	allTimePnl: number;
	allTimePnlPct: number;
	totalReturn: number;
	totalReturnPct: number;
}

// --- Helpers ---

const ANSI_GREEN = '\u001b[0;32m';
const ANSI_RED = '\u001b[0;31m';
const ANSI_RESET = '\u001b[0m';

function padRight(str: string, len: number): string {
	return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
	return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

/**
 * Extract unique trading days from trades, sorted most-recent first.
 */
export function getUniqueTradingDays(trades: Trade[]): string[] {
	const seen = new Set<string>();
	for (const t of trades) {
		seen.add(normalizeDate(t.date));
	}
	return [...seen].sort((a, b) => {
		const [am, ad, ay] = a.split('/').map(Number);
		const [bm, bd, by] = b.split('/').map(Number);
		return new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime();
	});
}

/**
 * Aggregate trades for a single day into a summary.
 */
export function getDaySummary(trades: Trade[]): DaySummary {
	const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
	const totalRisk = trades.reduce((s, t) => s + Math.abs(t.entryCost), 0);
	const wins = trades.filter(t => t.isWin).length;
	return {
		date: normalizeDate(trades[0].date),
		pnl: totalPnl,
		pnlPct: totalRisk > 0 ? (totalPnl / totalRisk) * 100 : 0,
		wins,
		losses: trades.length - wins,
		tradeCount: trades.length,
		totalRisk,
	};
}

// --- Recap embed ---

function getRecapFlavor(totalPnl: number, days: number): string {
	const avg = totalPnl / days;
	if (totalPnl > 1000) return `absolutely printing — ${fmtDollars(totalPnl)} over ${days} days 🔥`;
	if (totalPnl > 400) return `solid ${days}-day run — ${fmtDollars(totalPnl)} 🤝`;
	if (totalPnl > 0) return `grinding out ${fmtDollars(totalPnl)} over ${days} days 🫡`;
	if (totalPnl === 0) return `perfectly flat over ${days} days. impressive? 😐`;
	if (avg > -100) return `down ${fmtDollars(totalPnl)} over ${days} days... could be worse 🤷`;
	return `rough ${days} days — ${fmtDollars(totalPnl)} 💀`;
}

function formatDayRow(s: DaySummary): string {
	const color = s.pnl >= 0 ? ANSI_GREEN : ANSI_RED;
	const human = formatDateHuman(s.date);
	// "Mon 4/7" format
	const short = human.split(',')[0] + ' ' + s.date.split('/').slice(0, 2).join('/');
	const pnlStr = s.pnl >= 0 ? `+${fmtDollars(s.pnl)}` : fmtDollars(s.pnl);
	const record = `${s.wins}-${s.losses}`;
	const winRate = Math.round((s.wins / (s.wins + s.losses)) * 100);
	return `${color} ${padRight(short, 10)} ${padLeft(pnlStr, 8)}  ${padLeft(record, 4)} ${padLeft(`${winRate}%`, 4)}${ANSI_RESET}`;
}

export function buildRecapBlock(summaries: DaySummary[]): string {
	const lines = summaries.map(formatDayRow);
	return '```ansi\n' + lines.join('\n') + '\n```';
}

const FIELD_LIMIT = 1024;

function wrapAnsi(lines: string[]): string {
	return '```ansi\n' + lines.join('\n') + '\n```';
}

function chunkRecapRows(summaries: DaySummary[]): string[] {
	const rows = summaries.map(formatDayRow);
	const chunks: string[] = [];
	let batch: string[] = [];

	for (const row of rows) {
		const candidate = wrapAnsi([...batch, row]);
		if (candidate.length > FIELD_LIMIT && batch.length > 0) {
			chunks.push(wrapAnsi(batch));
			batch = [row];
		}
		else {
			batch.push(row);
		}
	}
	if (batch.length > 0) chunks.push(wrapAnsi(batch));
	return chunks;
}

function chunkDetailedBlocks(allTrades: Trade[], summaries: DaySummary[]): string[] {
	const chunks: string[] = [];
	let lines: string[] = [];

	for (const s of summaries) {
		const dayTrades = allTrades.filter(t => normalizeDate(t.date) === s.date);
		const grouped = groupTrades(dayTrades);
		const sorted = sortTrades(grouped);
		const pnlStr = s.pnl >= 0 ? `+${fmtDollars(s.pnl)}` : fmtDollars(s.pnl);
		const human = formatDateHuman(s.date);
		const short = human.split(',')[0] + ' ' + s.date.split('/').slice(0, 2).join('/');
		const header = `── ${short}  ${pnlStr} ──`;
		const block = buildTradeBlock(sorted, true);
		const inner = block.replace(/^```ansi\n/, '').replace(/\n```$/, '');
		const dayLines = [header, inner];

		const candidate = wrapAnsi([...lines, ...dayLines]);
		if (candidate.length > FIELD_LIMIT && lines.length > 0) {
			chunks.push(wrapAnsi(lines));
			lines = dayLines;
		}
		else {
			lines.push(...dayLines);
		}
	}
	if (lines.length > 0) chunks.push(wrapAnsi(lines));
	return chunks;
}

export function getRecapEmbed(allTrades: Trade[], dayCount: number, detailed = false): EmbedBuilder {
	const days = getUniqueTradingDays(allTrades).slice(0, dayCount);
	const summaries = days.map(date => {
		const dayTrades = allTrades.filter(t => normalizeDate(t.date) === date);
		return getDaySummary(dayTrades);
	});

	const totalPnl = summaries.reduce((s, d) => s + d.pnl, 0);
	const totalRisk = summaries.reduce((s, d) => s + d.totalRisk, 0);
	const totalPnlPct = totalRisk > 0 ? (totalPnl / totalRisk) * 100 : 0;
	const totalWins = summaries.reduce((s, d) => s + d.wins, 0);
	const totalLosses = summaries.reduce((s, d) => s + d.losses, 0);
	const totalTrades = summaries.reduce((s, d) => s + d.tradeCount, 0);
	const isUp = totalPnl >= 0;

	const bestDay = summaries.reduce((best, d) => d.pnl > best.pnl ? d : best, summaries[0]);
	const bestDayHuman = formatDateHuman(bestDay.date).split(',')[0]
		+ ' ' + bestDay.date.split('/').slice(0, 2).join('/');

	const winBar = buildWinBar(totalWins, totalLosses);

	const embed = new EmbedBuilder()
		.setColor(isUp ? 0x57F287 : 0xED4245)
		.setTitle(`📊 SPY 0DTE — Last ${summaries.length} Trading Day${summaries.length === 1 ? '' : 's'}`)
		.setDescription(getRecapFlavor(totalPnl, summaries.length))
		.addFields(
			{
				name: 'NET P/L',
				value: `**${isUp ? '+' : ''}${fmtDollars(totalPnl)}**\n${fmtPct(totalPnlPct)}`,
				inline: true,
			},
			{
				name: 'RECORD',
				value: `**${totalWins} - ${totalLosses}**\n${totalTrades} trades`,
				inline: true,
			},
			{
				name: 'BEST DAY',
				value: `**+${fmtDollars(bestDay.pnl)}**\n${bestDayHuman}`,
				inline: true,
			},
		);

	// Split daily rows into chunks that fit Discord's 1024-char field limit
	const fieldName = detailed ? 'DAILY BREAKDOWN' : 'DAILY P/L';
	if (detailed) {
		const chunks = chunkDetailedBlocks(allTrades, summaries);
		chunks.forEach((chunk, i) => {
			embed.addFields({
				name: i === 0 ? fieldName : '\u200b',
				value: chunk,
				inline: false,
			});
		});
	}
	else {
		const chunks = chunkRecapRows(summaries);
		chunks.forEach((chunk, i) => {
			embed.addFields({
				name: i === 0 ? fieldName : '\u200b',
				value: chunk,
				inline: false,
			});
		});
	}

	embed.setFooter({ text: winBar }).setTimestamp();
	return embed;
}

// --- Cash flow embed ---

export function parseCashFlowJson(json: string): CashFlowSummary {
	const d = JSON.parse(json);
	return {
		deposits: d.deposits,
		withdrawals: d.withdrawals,
		netDeposited: d.net_deposited,
		goldFees: d.gold_fees,
		dividends: d.dividends,
		referralGrants: d.referral_grants,
		netCashBasis: d.net_cash_basis,
		currentEquity: d.current_equity,
		allTimePnl: d.all_time_pnl,
		allTimePnlPct: d.all_time_pnl_pct,
		totalReturn: d.total_return,
		totalReturnPct: d.total_return_pct,
	};
}

function getCashFlowFlavor(pnl: number, pnlPct: number): string {
	if (pnl > 5000) return `up ${fmtDollars(pnl)} all-time (${fmtPct(pnlPct)}) — let him cook 🔥`;
	if (pnl > 1000) return `${fmtDollars(pnl)} all-time (${fmtPct(pnlPct)}) — not bad 🤝`;
	if (pnl > 0) return `barely positive at ${fmtDollars(pnl)} (${fmtPct(pnlPct)}) 😅`;
	if (pnl === 0) return 'perfectly breakeven all-time. how. 😐';
	if (pnl > -1000) return `down ${fmtDollars(pnl)} (${fmtPct(pnlPct)}) all-time... 🤷`;
	return `${fmtDollars(pnl)} all-time (${fmtPct(pnlPct)}) — maybe try index funds 🪦`;
}

export function getCashFlowEmbed(s: CashFlowSummary): EmbedBuilder {
	const isUp = s.allTimePnl >= 0;

	const breakdownLines = [
		`Deposits:      ${fmtDollars(s.deposits)}`,
		`Withdrawals:  ${fmtDollars(-s.withdrawals)}`,
		`Gold fees:    ${fmtDollars(-s.goldFees)}`,
		`Dividends:    +${fmtDollars(s.dividends)}`,
		`Referrals:    +${fmtDollars(s.referralGrants)}`,
	];

	return new EmbedBuilder()
		.setColor(isUp ? 0x57F287 : 0xED4245)
		.setTitle(`${isUp ? '📈' : '📉'} All-Time P/L`)
		.setDescription(getCashFlowFlavor(s.allTimePnl, s.allTimePnlPct))
		.addFields(
			{
				name: 'DEPOSITED',
				value: `**${fmtDollars(s.netDeposited)}**\nnet`,
				inline: true,
			},
			{
				name: 'EQUITY',
				value: `**${fmtDollars(s.currentEquity)}**\ncurrent`,
				inline: true,
			},
			{
				name: 'ALL-TIME P/L',
				value: `**${isUp ? '+' : ''}${fmtDollars(s.allTimePnl)}**\n${fmtPct(s.allTimePnlPct)}`,
				inline: true,
			},
			{
				name: 'BREAKDOWN',
				value: '```\n' + breakdownLines.join('\n') + '\n```',
				inline: false,
			},
		)
		.setFooter({ text: `Total return: ${s.totalReturn >= 0 ? '+' : ''}${fmtDollars(s.totalReturn)} (${fmtPct(s.totalReturnPct)}) — equity + withdrawals − deposits` })
		.setTimestamp();
}
