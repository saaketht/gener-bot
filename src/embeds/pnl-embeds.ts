import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { renderPnlLegsCard } from './pnl-trades-card';

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
	cumulativePnl: number;
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
			cumulativePnl: parseFloat(cols[23]),
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
	const year = y.length === 2 ? `20${y}` : y;
	return `${parseInt(m)}/${parseInt(d)}/${year}`;
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

export function fmtDollars(n: number): string {
	const abs = Math.abs(n);
	const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
	return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function fmtPct(n: number): string {
	return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

// --- Leg helpers (ported from rh-trade-exporter calendar.html) ---

export function typeAbbr(type: string): string {
	return type === 'Call' ? 'C' : type === 'Put' ? 'P' : '?';
}

// Hold-time formatter — calendar.html:1139-1149.
export function fmtHold(min: number | null | undefined): string {
	if (min == null) return '—';
	if (min < 60) return `${min}m`;
	if (min < 24 * 60) {
		const h = Math.floor(min / 60);
		const m = min % 60;
		return m ? `${h}h ${m}m` : `${h}h`;
	}
	const d = Math.floor(min / (24 * 60));
	const h = Math.floor((min - d * 24 * 60) / 60);
	return h ? `${d}d ${h}h` : `${d}d`;
}

export type ThetaBand = 'low' | 'building' | 'heavy' | 'extreme' | '';

// Theta-pressure band by hour of day (0DTE-specific). calendar.html:908-921.
export function thetaBand(hour: number | null | undefined): ThetaBand {
	if (hour == null) return '';
	if (hour < 11) return 'low';
	if (hour < 13) return 'building';
	if (hour < 15) return 'heavy';
	return 'extreme';
}

export function thetaBandLabel(hour: number | null | undefined): string {
	const b = thetaBand(hour);
	if (b === 'low') return 'low theta';
	if (b === 'building') return 'theta building';
	if (b === 'heavy') return 'theta heavy';
	if (b === 'extreme') return 'theta extreme';
	return '';
}

// --- Leg detection ---
// A "leg" = a continuous holding period for one (strike, type), bounded by going
// flat. Walks chronological events (one open per group_id + N closes), splits on
// flatlines. Same-price opens within OPEN_MERGE_SECS are treated as broker-
// fragmented opening executions (not real adds) and merged into the previous
// open/add event. Direct port of calendar.html:936-1136.

const OPEN_MERGE_SECS = 60;

export interface LegEvent {
	kind: 'open' | 'add' | 'scale-out' | 'close';
	time: string;
	datetime: string;
	qty: number;
	price: number;
	pl: number;
	groupId: string;
	direction?: 'avg-up' | 'avg-down' | 'flat';
	basisBefore?: number;
	outcome?: 'profit' | 'loss' | 'flat';
	_fills?: number;
}

export interface Leg {
	strike: number;
	type: string;
	startTime: string;
	endTime: string;
	startDatetime: string;
	endDatetime: string;
	totalOpened: number;
	totalClosed: number;
	totalEntryCost: number;
	totalExitCredit: number;
	pl: number;
	addsUp: number;
	addsDown: number;
	addsFlat: number;
	events: LegEvent[];
	avgEntry: number;
	avgExit: number;
	holdMin: number;
	entryHour: number | null;
	exitHour: number | null;
	cumulativePnl: number;
}

function groupKeyFor(t: Trade): string {
	return t.groupId || `${t.entryTime}-${t.strike}-${t.type}`;
}

function contractKeyFor(t: Trade): string {
	return `${t.strike}-${t.type}`;
}

// M/D/YYYY → YYYY-MM-DD so datetime strings sort lexicographically.
function toIsoDate(mdY: string): string {
	const parts = mdY.split('/');
	if (parts.length !== 3) return mdY;
	const [m, d, y] = parts.map(s => s.trim());
	const yyyy = y.length === 2 ? `20${y}` : y;
	return `${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function padTime(hms: string): string {
	if (!hms) return '00:00:00';
	const parts = hms.split(':');
	while (parts.length < 3) parts.push('00');
	return parts.map(p => p.padStart(2, '0')).join(':');
}

function toIsoDatetime(date: string, hms: string): string {
	return `${toIsoDate(date)}T${padTime(hms)}`;
}

function hourOf(time: string | null | undefined): number | null {
	if (!time) return null;
	const m = String(time).match(/(\d{1,2}):/);
	return m ? parseInt(m[1]) : null;
}

export function buildLegs(trades: Trade[]): { legs: Leg[]; anomalies: number } {
	const result: { legs: Leg[]; anomalies: number } = { legs: [], anomalies: 0 };
	if (!trades.length) return result;

	// 1. Group rows by groupId.
	const groups = new Map<string, Trade[]>();
	for (const t of trades) {
		const g = groupKeyFor(t);
		const arr = groups.get(g);
		if (arr) arr.push(t);
		else groups.set(g, [t]);
	}

	// 2. For each (strike, type), build chronological event list.
	const byContract = new Map<string, LegEvent[]>();
	groups.forEach(rows => {
		const first = rows[0];
		const ck = contractKeyFor(first);
		const totalQty = rows.reduce((s, r) => s + (r.qty || 0), 0);
		if (totalQty === 0) {
			result.anomalies += rows.length;
			return;
		}
		const totalEntryCost = rows.reduce((s, r) => s + Math.abs(r.entryCost || 0), 0);
		const openPx = totalEntryCost / (totalQty * 100);

		const evs = byContract.get(ck) ?? [];
		evs.push({
			kind: 'open',
			time: first.entryTime,
			datetime: toIsoDatetime(first.date, first.entryTime),
			qty: totalQty,
			price: openPx,
			pl: 0,
			groupId: groupKeyFor(first),
		});
		for (const r of rows) {
			if (!(r.qty > 0)) continue;
			const xPx = (r.exitCredit || 0) / (r.qty * 100);
			evs.push({
				kind: 'close',
				time: r.exitTime,
				datetime: toIsoDatetime(r.date, r.exitTime),
				qty: r.qty,
				price: xPx,
				pl: r.pnl || 0,
				groupId: groupKeyFor(r),
			});
		}
		byContract.set(ck, evs);
	});

	// 3. For each contract: sort events, walk netQty, split at flatlines.
	//    Merge same-price opens within OPEN_MERGE_SECS into the prior open/add.
	byContract.forEach((events, ck) => {
		events.sort((a, b) => a.datetime.localeCompare(b.datetime));
		const [strikeStr, type] = ck.split('-');
		const strike = parseFloat(strikeStr);
		let leg: Leg | null = null;
		let netQty = 0;

		for (const e of events) {
			if (!leg) {
				leg = {
					strike, type, events: [],
					startTime: e.time, endTime: e.time,
					startDatetime: e.datetime, endDatetime: e.datetime,
					totalOpened: 0, totalClosed: 0,
					totalEntryCost: 0, totalExitCredit: 0,
					pl: 0, addsDown: 0, addsUp: 0, addsFlat: 0,
					avgEntry: 0, avgExit: 0, holdMin: 0,
					entryHour: null, exitHour: null, cumulativePnl: 0,
				};
			}
			const ev: LegEvent = { ...e };

			if (e.kind === 'open') {
				if (netQty > 0 && leg.totalOpened > 0) {
					const basis = leg.totalEntryCost / (leg.totalOpened * 100);
					const lastOpenLike = [...leg.events].reverse().find(x => x.kind === 'open' || x.kind === 'add');
					const samePrice = Math.abs(e.price - basis) < 0.005;
					const dtDelta = lastOpenLike
						? Math.abs((new Date(e.datetime).getTime() - new Date(lastOpenLike.datetime).getTime()) / 1000)
						: Infinity;
					const closeInTime = !!lastOpenLike && dtDelta <= OPEN_MERGE_SECS;

					if (samePrice && closeInTime && lastOpenLike) {
						// Broker-fragmented open: merge into previous open/add.
						lastOpenLike.qty += e.qty;
						lastOpenLike._fills = (lastOpenLike._fills || 1) + 1;
						lastOpenLike.time = e.time;
						lastOpenLike.datetime = e.datetime;
						leg.totalOpened += e.qty;
						leg.totalEntryCost += e.price * e.qty * 100;
						netQty += e.qty;
						leg.endTime = e.time;
						leg.endDatetime = e.datetime;
						continue;
					}

					ev.kind = 'add';
					ev.basisBefore = basis;
					if (e.price < basis - 0.005) {
						ev.direction = 'avg-down';
						leg.addsDown++;
					}
					else if (e.price > basis + 0.005) {
						ev.direction = 'avg-up';
						leg.addsUp++;
					}
					else {
						ev.direction = 'flat';
						leg.addsFlat++;
					}
				}
				leg.totalOpened += e.qty;
				leg.totalEntryCost += e.price * e.qty * 100;
				netQty += e.qty;
			}
			else {
				leg.totalClosed += e.qty;
				leg.totalExitCredit += e.price * e.qty * 100;
				leg.pl += e.pl;
				netQty -= e.qty;
			}
			leg.events.push(ev);
			leg.endTime = e.time;
			leg.endDatetime = e.datetime;

			if (netQty <= 0) {
				result.legs.push(leg);
				leg = null;
				netQty = 0;
			}
		}
		if (leg) result.legs.push(leg);
	});

	// 4. Per-leg post-pass: merge same-price consecutive closes, annotate
	//    scale-out vs final close + outcome, compute averages and hours.
	for (const l of result.legs) {
		const merged: LegEvent[] = [];
		for (const e of l.events) {
			const last = merged[merged.length - 1];
			const dtDelta = last
				? Math.abs((new Date(e.datetime).getTime() - new Date(last.datetime).getTime()) / 1000)
				: Infinity;
			if (last && e.kind === 'close' && last.kind === 'close'
				&& Math.abs(e.price - last.price) < 0.005
				&& dtDelta <= OPEN_MERGE_SECS) {
				last.qty += e.qty;
				last.pl += e.pl;
				last._fills = (last._fills || 1) + 1;
				last.time = e.time;
				last.datetime = e.datetime;
			}
			else {
				merged.push({ ...e });
			}
		}
		l.events = merged;

		let n = 0;
		for (const e of l.events) {
			if (e.kind === 'open' || e.kind === 'add') {
				n += e.qty;
			}
			else {
				n -= e.qty;
				e.kind = n > 0 ? 'scale-out' : 'close';
				e.outcome = e.pl > 0 ? 'profit' : e.pl < 0 ? 'loss' : 'flat';
			}
		}
		l.avgEntry = l.totalOpened ? l.totalEntryCost / (l.totalOpened * 100) : 0;
		l.avgExit = l.totalClosed ? l.totalExitCredit / (l.totalClosed * 100) : 0;
		l.holdMin = (l.startDatetime && l.endDatetime)
			? Math.round((new Date(l.endDatetime).getTime() - new Date(l.startDatetime).getTime()) / 60000)
			: 0;
		l.entryHour = hourOf(l.startTime);
		l.exitHour = hourOf(l.endTime);
	}

	// 5. Per-day running cumulative P/L through each leg, anchored at the close
	//    time (when the leg's P/L is realized). The CSV's Cumulative P/L column
	//    is all-time/cross-day, which isn't what we want for a per-day card —
	//    derive it locally from leg.pl ordered by endDatetime.
	const byEnd = [...result.legs].sort((a, b) => a.endDatetime.localeCompare(b.endDatetime));
	let running = 0;
	for (const l of byEnd) {
		running += l.pl;
		l.cumulativePnl = running;
	}

	result.legs.sort((a, b) => a.startDatetime.localeCompare(b.startDatetime));
	return result;
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

// --- Recap-only path ---
// groupTrades / sortTrades / buildTradeBlock are retained for recap-embeds.ts
// (multi-day text recap). The single-day pnl card uses buildLegs (above) + the
// PNG renderer instead. Delete this block once recap is migrated.

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

export interface PnlEmbedResult {
	embed: EmbedBuilder;
	files: AttachmentBuilder[];
}

let pnlCardCounter = 0;

export function getPnlEmbed(trades: Trade[], dateStr: string): PnlEmbedResult {
	const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
	const totalRisk = trades.reduce((sum, t) => sum + Math.abs(t.entryCost), 0);
	const totalPnlPct = totalRisk > 0 ? (totalPnl / totalRisk) * 100 : 0;
	const wins = trades.filter(t => t.isWin).length;
	const losses = trades.length - wins;
	const isUp = totalPnl >= 0;

	const { legs } = buildLegs(trades);
	const winBar = buildWinBar(wins, losses);

	const embed = new EmbedBuilder()
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
		)
		.setFooter({ text: winBar })
		.setTimestamp();

	// Render legs as a PNG attachment — Discord embed code blocks have an
	// unfixable wrap problem (discord.js#3030), pixel-rendered tables don't.
	const files: AttachmentBuilder[] = [];
	const card = renderPnlLegsCard(legs);
	if (card) {
		const filename = `pnl-${++pnlCardCounter}.png`;
		files.push(new AttachmentBuilder(card, { name: filename }));
		embed.setImage(`attachment://${filename}`);
	}

	return { embed, files };
}

export function getNoTradesEmbed(dateStr: string, recapBlock?: string): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(0x6B7280)
		.setTitle(`📊 SPY 0DTE — ${dateStr}`)
		.setDescription(`${formatDateHuman(dateStr)}\n\nNo trades found for this date.`)
		.setTimestamp();
	if (recapBlock) {
		embed.addFields({ name: 'RECENT', value: recapBlock, inline: false });
	}
	return embed;
}
