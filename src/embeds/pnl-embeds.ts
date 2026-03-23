import { EmbedBuilder } from 'discord.js';

export interface Trade {
	tradeNum: number;
	date: string;
	day: string;
	symbol: string;
	type: string;
	strike: number;
	qty: number;
	entryTime: string;
	exitTime: string;
	holdTime: number;
	entryCost: number;
	exitCredit: number;
	pnl: number;
	pnlPct: number;
	isWin: boolean;
	groupId: string;
}

export function parseTradesCSV(csv: string): Trade[] {
	const lines = csv.trim().split('\n');
	if (lines.length < 2) return [];

	// Skip header
	return lines.slice(1).map(line => {
		const cols = line.split(',');
		return {
			tradeNum: parseInt(cols[0]),
			date: cols[1],
			day: cols[2],
			symbol: cols[4],
			type: cols[6],
			strike: parseFloat(cols[7]),
			qty: parseInt(cols[8]),
			entryTime: cols[15],
			exitTime: cols[16],
			holdTime: parseInt(cols[17]),
			entryCost: parseFloat(cols[19]),
			exitCredit: parseFloat(cols[21]),
			pnl: parseFloat(cols[22]),
			pnlPct: parseFloat(cols[24]),
			isWin: cols[26] === '1',
			groupId: cols[29],
		};
	});
}

// Normalize date strings to M/D/YYYY for comparison
// CSV uses M/D/YYYY (no leading zeros)
export function normalizeDate(dateStr: string): string {
	const parts = dateStr.split('/');
	if (parts.length !== 3) return dateStr;
	const [m, d, y] = parts;
	return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

export function getTodayDateStr(): string {
	const now = new Date();
	return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
}

// Format M/D/YYYY to "Mon, Mar 23 2026"
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDateHuman(dateStr: string): string {
	const parts = dateStr.split('/');
	if (parts.length !== 3) return dateStr;
	const [m, d, y] = parts.map(Number);
	const date = new Date(y, m - 1, d);
	return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${d} ${y}`;
}

function fmtDollars(n: number): string {
	const abs = Math.abs(n);
	const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
	return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

function fmtPct(n: number): string {
	return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function getFlavorText(totalPnl: number, totalPnlPct: number): string {
	if (totalPnl > 500) return `dude fr made +${fmtDollars(totalPnl)} (${fmtPct(totalPnlPct)}) today 🔥`;
	if (totalPnl > 200) return `bro made +${fmtDollars(totalPnl)} (${fmtPct(totalPnlPct)}) today 🤯`;
	if (totalPnl > 0) return `scraped out +${fmtDollars(totalPnl)} (${fmtPct(totalPnlPct)}) today 😧`;
	if (totalPnl === 0) return 'broke even. 😐';
	if (totalPnl > -100) return `lost ${fmtDollars(totalPnl)} (${fmtPct(totalPnlPct)}) today... 🤷`;
	if (totalPnl > -300) return `idiot lost ${fmtDollars(totalPnl)} (${fmtPct(totalPnlPct)}) today 💀`;
	return `absolute disaster — ${fmtDollars(totalPnl)} (${fmtPct(totalPnlPct)}) today 🪦`;
}

// --- Grouping ---

interface GroupedTrade {
	type: string;
	strike: number;
	qty: number;
	bought: string;
	sold: string;
	pnl: number;
	pnlPct: number;
	holdTime: number;
	isWin: boolean;
}

function groupKey(t: Trade): string {
	const bought = (Math.abs(t.entryCost) / t.qty / 100).toFixed(2);
	const sold = (t.exitCredit / t.qty / 100).toFixed(2);
	return `${t.type}|${t.strike}|${bought}|${sold}|${t.holdTime}`;
}

export function groupTrades(trades: Trade[]): GroupedTrade[] {
	const groups = new Map<string, GroupedTrade>();
	for (const t of trades) {
		const key = groupKey(t);
		const bought = (Math.abs(t.entryCost) / t.qty / 100).toFixed(2);
		const sold = (t.exitCredit / t.qty / 100).toFixed(2);
		const existing = groups.get(key);
		if (existing) {
			existing.qty += t.qty;
			existing.pnl += t.pnl;
		}
		else {
			groups.set(key, {
				type: t.type, strike: t.strike, qty: t.qty,
				bought, sold, pnl: t.pnl, pnlPct: t.pnlPct,
				holdTime: t.holdTime, isWin: t.isWin,
			});
		}
	}
	return [...groups.values()];
}

// --- Sorting ---

export function sortTrades(grouped: GroupedTrade[]): GroupedTrade[] {
	const wins = grouped.filter(t => t.isWin).sort((a, b) => b.pnl - a.pnl);
	const losses = grouped.filter(t => !t.isWin).sort((a, b) => a.pnl - b.pnl);
	return [...wins, ...losses];
}

// --- ANSI formatting ---

// Discord ANSI escape codes
const ANSI_GREEN = '\u001b[0;32m';
const ANSI_RED = '\u001b[0;31m';
const ANSI_RESET = '\u001b[0m';

function padRight(str: string, len: number): string {
	return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
	return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

function formatTradeRowAnsi(g: GroupedTrade): string {
	const color = g.isWin ? ANSI_GREEN : ANSI_RED;
	const contract = padRight(`${g.type} ${g.strike}`, 10);
	const pnlStr = g.pnl >= 0 ? `+${fmtDollars(g.pnl)}` : fmtDollars(g.pnl);
	const pnlPad = padLeft(pnlStr, 7);
	const holdStr = `held ${g.holdTime} mins`;
	return `${color} ${contract}${pnlPad}  ${holdStr}${ANSI_RESET}`;
}

// Detailed row (for toggle)
// Target ~48 chars to fit embed width
function formatTradeRowDetailed(g: GroupedTrade): string {
	const color = g.isWin ? ANSI_GREEN : ANSI_RED;
	const contract = padRight(`${g.type} ${g.strike}`, 9);
	const prices = `$${g.bought}→$${g.sold}`;
	const pricesPad = padRight(prices, 13);
	const pnlStr = g.pnl >= 0 ? `+${fmtDollars(g.pnl)}` : fmtDollars(g.pnl);
	const pnlPct = `${pnlStr}(${fmtPct(g.pnlPct)})`;
	const pnlPad = padLeft(pnlPct, 17);
	const holdPad = padLeft(`${g.holdTime}m`, 5);
	return `${color} ${g.qty}x ${contract}${pricesPad} ${pnlPad} ${holdPad}${ANSI_RESET}`;
}

export function buildTradeBlock(sorted: GroupedTrade[], detailed = false): string {
	const formatter = detailed ? formatTradeRowDetailed : formatTradeRowAnsi;
	const wins = sorted.filter(t => t.isWin);
	const losses = sorted.filter(t => !t.isWin);

	const lines: string[] = [];
	for (const t of wins) lines.push(formatter(t));
	if (wins.length > 0 && losses.length > 0) {
		lines.push('─'.repeat(detailed ? 48 : 33));
	}
	for (const t of losses) lines.push(formatter(t));

	return '```ansi\n' + lines.join('\n') + '\n```';
}

// --- Win/loss bar ---

export function buildWinBar(wins: number, losses: number): string {
	const winRate = Math.round((wins / (wins + losses)) * 100);
	return '🟩'.repeat(wins) + '🟥'.repeat(losses) + `  ${winRate}% win rate`;
}

// --- Embeds ---

export function getPnlEmbed(trades: Trade[], dateStr: string, detailed = false): EmbedBuilder {
	const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
	const totalRisk = trades.reduce((sum, t) => sum + Math.abs(t.entryCost), 0);
	const totalPnlPct = totalRisk > 0 ? (totalPnl / totalRisk) * 100 : 0;
	const wins = trades.filter(t => t.isWin).length;
	const losses = trades.length - wins;
	const isUp = totalPnl >= 0;

	const grouped = groupTrades(trades);
	const sorted = sortTrades(grouped);
	const tradeBlock = buildTradeBlock(sorted, detailed);
	const winBar = buildWinBar(wins, losses);

	return new EmbedBuilder()
		.setColor(isUp ? 0x57F287 : 0xED4245)
		.setTitle(`${isUp ? '📈' : '📉'} SPY 0DTE — ${dateStr}`)
		.setDescription(getFlavorText(totalPnl, totalPnlPct))
		.addFields(
			{
				name: 'NET P/L',
				value: `**${isUp ? '+' : ''}${fmtDollars(totalPnl)}**\n${fmtPct(totalPnlPct)}`,
				inline: true,
			},
			{
				name: 'RECORD',
				value: `**${wins} - ${losses}**\n${trades.length} trades`,
				inline: true,
			},
			{
				name: 'RISKED',
				value: `**${fmtDollars(totalRisk)}**\n${fmtPct(totalPnlPct)} return`,
				inline: true,
			},
			{
				name: 'TRADES',
				value: tradeBlock,
				inline: false,
			},
		)
		.setFooter({ text: winBar })
		.setTimestamp();
}

export function getNoTradesEmbed(dateStr: string): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(0x6B7280)
		.setTitle(`📊 SPY 0DTE — ${dateStr}`)
		.setDescription(`${formatDateHuman(dateStr)}\n\nNo trades found for this date.`)
		.setTimestamp();
}
