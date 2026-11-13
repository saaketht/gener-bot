import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { BarSeries } from './priceApi';

// Scheduled post time (09:58 ET — after the 09:25–10:00 hands-off window starts
// winding down, so it never reads as a cue to trade the open) and the latest a
// restarted bot may still post it.
export const POST_MIN = 9 * 60 + 58;
export const LATE_MIN = 10 * 60 + 15;
const PM_START_MIN = 4 * 60;
const REG_START_MIN = 9 * 60 + 30;
const REG_END_MIN = 16 * 60;
const OVERNIGHT_START_MIN = 18 * 60;

// Which symbols the levels post shows and how each renders. Drop an entry to drop
// its line — no logic changes. 'primary' gets the full level block and anchors the
// 'relative' divergence note; the first primary entry also gates the post.
export type LineKind = 'primary' | 'relative' | 'vix' | 'overnight';
export const LEVELS_CONFIG: { label: string; yahoo: string; kind: LineKind }[] = [
	{ label: 'SPY', yahoo: 'SPY', kind: 'primary' },
	{ label: 'QQQ', yahoo: 'QQQ', kind: 'relative' },
	{ label: 'VIX', yahoo: '^VIX', kind: 'vix' },
	{ label: 'MCL', yahoo: 'MCL=F', kind: 'overnight' },
];

export interface EtTime { date: string; minutes: number; weekday: number }

const etFmt = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/New_York', hourCycle: 'h23', weekday: 'short',
	year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Wall-clock ET for an epoch-seconds timestamp: YYYY-MM-DD, minutes past midnight,
// weekday (0 = Sun).
export function etParts(tSec: number): EtTime {
	const p: Record<string, string> = {};
	for (const { type, value } of etFmt.formatToParts(new Date(tSec * 1000))) p[type] = value;
	return {
		date: `${p.year}-${p.month}-${p.day}`,
		minutes: parseInt(p.hour) * 60 + parseInt(p.minute),
		weekday: WEEKDAYS.indexOf(p.weekday),
	};
}

function prevCalendarDate(date: string): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

export interface SymbolLevels {
	last: number;
	prevClose: number;
	changePct: number;
	hasToday: boolean;
	pmHigh?: number;
	pmLow?: number;
	orHigh?: number;
	orLow?: number;
	pdHigh?: number;
	pdLow?: number;
	todayHigh?: number;
	todayLow?: number;
	overnightPct?: number;
}

function hiLo(bars: BarSeries['bars']): { high?: number; low?: number } {
	if (bars.length === 0) return {};
	return {
		high: Math.max(...bars.map(b => b.high ?? b.close)),
		low: Math.min(...bars.map(b => b.low ?? b.close)),
	};
}

// All levels for one symbol as of nowSec. Bars are classified by their ET start
// time: premarket = 04:00–09:29 today, opening range = 09:30 up to the post time,
// prior day = the latest earlier date that has regular-session bars (so weekends
// and holidays are skipped naturally). Regular session comes from Yahoo's
// per-day windows when present (handles early closes), else 09:30–16:00 ET.
export function computeLevels(series: BarSeries, nowSec: number): SymbolLevels | null {
	const bars = series.bars.filter(b => b.t <= nowSec);
	if (bars.length === 0) return null;
	const today = etParts(nowSec).date;
	const tagged = bars.map(b => ({ b, et: etParts(b.t) }));
	const isRegular = (t: number, minutes: number) => series.regular_windows.length
		? series.regular_windows.some(w => t >= w.start && t < w.end)
		: minutes >= REG_START_MIN && minutes < REG_END_MIN;

	const regular = tagged.filter(x => isRegular(x.b.t, x.et.minutes));
	const todayReg = regular.filter(x => x.et.date === today);
	const priorDate = regular.map(x => x.et.date).filter(d => d < today).pop();
	const prior = regular.filter(x => x.et.date === priorDate).map(x => x.b);
	const pm = tagged.filter(x => x.et.date === today && x.et.minutes >= PM_START_MIN && x.et.minutes < REG_START_MIN).map(x => x.b);
	const or = todayReg.filter(x => x.et.minutes < POST_MIN).map(x => x.b);

	// Official prior close: meta.previousClose is relative to regularMarketTime, so
	// it's only "yesterday" once today's session has printed. Before the open,
	// regularMarketPrice *is* the prior close. Last prior-day bar is the fallback.
	const regTimeToday = series.regular_time != null && etParts(series.regular_time).date === today;
	const prevClose = (regTimeToday ? series.prev_close : series.regular_price)
		?? series.prev_close ?? prior[prior.length - 1]?.close;
	if (!prevClose) return null;

	const last = bars[bars.length - 1].close;
	const pmHL = hiLo(pm), orHL = hiLo(or), pdHL = hiLo(prior), todayHL = hiLo(todayReg.map(x => x.b));

	// Overnight = first bar at/after the most recent 18:00 ET — the previous
	// calendar day's for the morning post (Sunday 18:00 on a Monday, when futures
	// reopen), today's once it's past 18:00 — measured from that bar's open.
	const nowMin = etParts(nowSec).minutes;
	const onDate = nowMin >= OVERNIGHT_START_MIN ? today : prevCalendarDate(today);
	const onStart = tagged.find(x => (x.et.date === onDate && x.et.minutes >= OVERNIGHT_START_MIN) || x.et.date > onDate)?.b;
	const onBase = onStart ? (onStart.open ?? onStart.close) : undefined;

	return {
		last,
		prevClose,
		changePct: ((last - prevClose) / prevClose) * 100,
		hasToday: todayReg.length > 0,
		pmHigh: pmHL.high, pmLow: pmHL.low,
		orHigh: orHL.high, orLow: orHL.low,
		pdHigh: pdHL.high, pdLow: pdHL.low,
		todayHigh: todayHL.high, todayLow: todayHL.low,
		overnightPct: onBase ? ((last - onBase) / onBase) * 100 : undefined,
	};
}

// Same thresholds as rh-trade-exporter static/js/day/format.js vixBand.
export function vixBand(v: number): 'calm' | 'elev' | 'high' | 'crit' {
	if (v <= 15) return 'calm';
	if (v <= 20) return 'elev';
	if (v <= 30) return 'high';
	return 'crit';
}

export function pmPosition(last: number, high?: number, low?: number): string | null {
	if (high == null || low == null) return null;
	if (last > high) return 'above PMH';
	if (last < low) return 'below PML';
	return 'inside PM';
}

// One-line read of where price sits: OR, then premarket (inside → nearer edge),
// then prior day only when price has broken out of it.
export function whereNow(lv: SymbolLevels): string {
	const parts: string[] = [];
	const { last } = lv;
	if (lv.orHigh != null && lv.orLow != null) {
		parts.push(last > lv.orHigh ? 'above OR' : last < lv.orLow ? 'below OR' : 'inside OR');
	}
	if (lv.pmHigh != null && lv.pmLow != null) {
		if (last > lv.pmHigh) parts.push('above PMH');
		else if (last < lv.pmLow) parts.push('below PML');
		else parts.push(lv.pmHigh - last <= last - lv.pmLow ? 'below PMH' : 'above PML');
	}
	if (lv.pdHigh != null && last > lv.pdHigh) parts.push('above PDH');
	else if (lv.pdLow != null && last < lv.pdLow) parts.push('below PDL');
	return parts.join(', ');
}

export type MarketCalendar = Record<string, { status?: string; name?: string }>;

export const CALENDAR_PATH = join(homedir(), 'rh-trade-exporter', 'outputs', 'market_calendar.json');

// rh-trade-exporter's calendar (same VM). Missing/corrupt → {} (treated as open;
// the no-regular-bars-today check is the backstop).
export async function readMarketCalendar(path = CALENDAR_PATH): Promise<MarketCalendar> {
	try {
		return JSON.parse(await readFile(path, 'utf-8'))?.days ?? {};
	}
	catch {
		return {};
	}
}

// Scheduled-post gate: weekday, 09:58–10:15 ET (so a restart inside the window
// still posts), not already posted today (persisted, so a restart never
// double-posts), and not a market holiday. Early closes still post.
export function shouldPostLevels(now: EtTime, lastPosted: string | null, calendar: MarketCalendar): boolean {
	if (now.weekday === 0 || now.weekday === 6) return false;
	if (now.minutes < POST_MIN || now.minutes > LATE_MIN) return false;
	if (lastPosted === now.date) return false;
	return calendar[now.date]?.status !== 'closed';
}
