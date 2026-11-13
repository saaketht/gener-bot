import { describe, it, expect } from 'vitest';
import { computeLevels, etParts, shouldPostLevels, vixBand, whereNow, pmPosition, SymbolLevels } from './marketLevels';
import { Bar, BarSeries } from './priceApi';

// Epoch seconds for an ET wall-clock time. All fixtures are EST (UTC-5) dates.
const et = (date: string, hh: number, mm = 0) => Date.parse(`${date}T00:00:00Z`) / 1000 + (hh + 5) * 3600 + mm * 60;
const bar = (t: number, close: number, high = close, low = close, open = close): Bar => ({ t, open, high, low, close });
// A full regular session of flat 5m bars at `price`, plus optional extremes.
function session(date: string, price: number): Bar[] {
	const out: Bar[] = [];
	for (let m = 9 * 60 + 30; m < 16 * 60; m += 5) out.push(bar(et(date, 0, m), price));
	return out;
}
const series = (bars: Bar[], extra: Partial<BarSeries> = {}): BarSeries =>
	({ symbol: 'SPY', bars: bars.sort((a, b) => a.t - b.t), regular_windows: [], ...extra });

describe('etParts', () => {
	it('converts to ET wall clock with weekday', () => {
		expect(etParts(et('2026-11-09', 9, 58))).toEqual({ date: '2026-11-09', minutes: 598, weekday: 1 });
		// 23:30 ET is already the next day in UTC
		expect(etParts(et('2026-11-08', 23, 30)).date).toBe('2026-11-08');
	});
});

describe('computeLevels', () => {
	const MON = '2026-11-09';
	const FRI = '2026-11-06';
	const now = et(MON, 9, 58);

	it('premarket window is 04:00–09:29 inclusive of edges', () => {
		const lv = computeLevels(series([
			...session(FRI, 700),
			bar(et(MON, 3, 55), 690, 999, 1),
			bar(et(MON, 4, 0), 700, 710, 699),
			bar(et(MON, 9, 25), 701, 702, 695),
			bar(et(MON, 9, 30), 703, 750, 650),
		]), now)!;
		expect(lv.pmHigh).toBe(710);
		expect(lv.pmLow).toBe(695);
	});

	it('opening range covers 09:30 up to the post time only', () => {
		const lv = computeLevels(series([
			...session(FRI, 700),
			bar(et(MON, 9, 30), 703, 705, 701),
			bar(et(MON, 9, 55), 704, 706, 700),
			bar(et(MON, 10, 0), 710, 720, 680),
		]), et(MON, 10, 10))!;
		expect(lv.orHigh).toBe(706);
		expect(lv.orLow).toBe(700);
		expect(lv.hasToday).toBe(true);
		expect(lv.last).toBe(710);
	});

	it('ignores bars after now', () => {
		const lv = computeLevels(series([...session(FRI, 700), bar(et(MON, 9, 30), 703), bar(et(MON, 10, 30), 999)]), now)!;
		expect(lv.last).toBe(703);
	});

	it('prior day skips a weekend and excludes extended-hours bars', () => {
		const lv = computeLevels(series([
			...session('2026-11-05', 650),
			...session(FRI, 700),
			bar(et(FRI, 9, 45), 700, 712, 690),
			bar(et(FRI, 17, 0), 700, 800, 600),
			bar(et(MON, 8, 0), 705),
		]), now)!;
		expect(lv.pdHigh).toBe(712);
		expect(lv.pdLow).toBe(690);
		expect(lv.hasToday).toBe(false);
	});

	it('prior day skips a holiday', () => {
		// Fri after Thanksgiving: Thu 11-26 closed, prior day is Wed 11-25
		const lv = computeLevels(series([
			...session('2026-11-24', 600),
			...session('2026-11-25', 650),
			bar(et('2026-11-26', 8, 0), 700, 900, 100),
			bar(et('2026-11-27', 9, 30), 655),
		]), et('2026-11-27', 9, 58))!;
		expect(lv.pdHigh).toBe(650);
		expect(lv.pdLow).toBe(650);
	});

	it('uses Yahoo regular windows when present (early close)', () => {
		const date = '2026-11-27';
		const lv = computeLevels(series([
			bar(et(date, 12, 55), 650),
			bar(et(date, 14, 0), 700, 900, 100),
			bar(et('2026-11-30', 9, 30), 655),
		], { regular_windows: [{ start: et(date, 9, 30), end: et(date, 13) }, { start: et('2026-11-30', 9, 30), end: et('2026-11-30', 16) }] }), et('2026-11-30', 9, 58))!;
		expect(lv.pdHigh).toBe(650);
	});

	it('prior close: meta.previousClose once today has printed, regularMarketPrice before the open', () => {
		const bars = [...session(FRI, 700), bar(et(MON, 8, 0), 707)];
		expect(computeLevels(series(bars, { prev_close: 690, regular_price: 701, regular_time: et(MON, 9, 40) }), now)!.prevClose).toBe(690);
		expect(computeLevels(series(bars, { prev_close: 690, regular_price: 701, regular_time: et(FRI, 16) }), now)!.prevClose).toBe(701);
		const lv = computeLevels(series(bars), now)!;
		expect(lv.prevClose).toBe(700);
		expect(lv.changePct).toBeCloseTo(1, 5);
	});

	it('overnight change starts at 18:00 the previous calendar day (Sunday on a Monday)', () => {
		const lv = computeLevels(series([
			bar(et(FRI, 16, 55), 80),
			bar(et('2026-11-08', 18, 0), 81, 81, 81, 80.5),
			bar(et(MON, 9, 55), 82.11),
		], { prev_close: 80 }), now)!;
		expect(lv.overnightPct).toBeCloseTo((82.11 - 80.5) / 80.5 * 100, 5);
	});

	it('overnight on-demand after 18:00 uses today\'s 18:00', () => {
		const lv = computeLevels(series([
			bar(et('2026-11-08', 18, 0), 81, 81, 81, 80.5),
			bar(et(MON, 18, 0), 83, 83, 83, 82),
			bar(et(MON, 20, 0), 84),
		], { prev_close: 80 }), et(MON, 20, 5))!;
		expect(lv.overnightPct).toBeCloseTo((84 - 82) / 82 * 100, 5);
	});
});

describe('vixBand', () => {
	it('matches rh-trade-exporter thresholds', () => {
		expect(vixBand(12)).toBe('calm');
		expect(vixBand(15)).toBe('calm');
		expect(vixBand(15.01)).toBe('elev');
		expect(vixBand(20)).toBe('elev');
		expect(vixBand(20.01)).toBe('high');
		expect(vixBand(30)).toBe('high');
		expect(vixBand(30.01)).toBe('crit');
	});
});

describe('whereNow', () => {
	const base: SymbolLevels = {
		last: 0, prevClose: 700, changePct: 0, hasToday: true,
		pmHigh: 710, pmLow: 690, orHigh: 705, orLow: 698, pdHigh: 720, pdLow: 680,
	};
	it('inside OR, nearer PM edge', () => {
		expect(whereNow({ ...base, last: 704 })).toBe('inside OR, below PMH');
		expect(whereNow({ ...base, last: 699 })).toBe('inside OR, above PML');
	});
	it('breakouts', () => {
		expect(whereNow({ ...base, last: 712 })).toBe('above OR, above PMH');
		expect(whereNow({ ...base, last: 725 })).toBe('above OR, above PMH, above PDH');
		expect(whereNow({ ...base, last: 675 })).toBe('below OR, below PML, below PDL');
	});
	it('premarket only (no OR yet)', () => {
		expect(whereNow({ ...base, orHigh: undefined, orLow: undefined, last: 711 })).toBe('above PMH');
	});
	it('pmPosition', () => {
		expect(pmPosition(711, 710, 690)).toBe('above PMH');
		expect(pmPosition(689, 710, 690)).toBe('below PML');
		expect(pmPosition(700, 710, 690)).toBe('inside PM');
		expect(pmPosition(700)).toBeNull();
	});
});

describe('shouldPostLevels', () => {
	const at = (date: string, hh: number, mm: number) => etParts(et(date, hh, mm));
	const MON = '2026-11-09';
	it('posts weekdays 09:58–10:15 ET only', () => {
		expect(shouldPostLevels(at(MON, 9, 57), null, {})).toBe(false);
		expect(shouldPostLevels(at(MON, 9, 58), null, {})).toBe(true);
		expect(shouldPostLevels(at(MON, 10, 15), null, {})).toBe(true);
		expect(shouldPostLevels(at(MON, 10, 16), null, {})).toBe(false);
		expect(shouldPostLevels(at('2026-11-07', 9, 58), null, {})).toBe(false);
		expect(shouldPostLevels(at('2026-11-08', 9, 58), null, {})).toBe(false);
	});
	it('restart mid-window posts once, never twice', () => {
		// bot comes up at 10:07 having not posted today → posts
		expect(shouldPostLevels(at(MON, 10, 7), '2026-11-06', {})).toBe(true);
		// restart after the post went out → posted-date already today
		expect(shouldPostLevels(at(MON, 10, 8), MON, {})).toBe(false);
	});
	it('skips closed days, still posts early closes', () => {
		expect(shouldPostLevels(at('2026-11-26', 9, 58), null, { '2026-11-26': { status: 'closed', name: 'Thanksgiving' } })).toBe(false);
		expect(shouldPostLevels(at('2026-11-27', 9, 58), null, { '2026-11-27': { status: 'early-close' } })).toBe(true);
	});
});
