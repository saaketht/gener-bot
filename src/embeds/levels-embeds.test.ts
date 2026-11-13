import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildLevelsMessage, formatLines } from './levels-embeds';
import { SymbolLevels } from '../utils/marketLevels';

const et = (date: string, hh: number, mm = 0) => Date.parse(`${date}T00:00:00Z`) / 1000 + (hh + 5) * 3600 + mm * 60;

const lv = (o: Partial<SymbolLevels>): SymbolLevels => ({ last: 700, prevClose: 700, changePct: 0, hasToday: true, ...o });

describe('formatLines', () => {
	it('primary block is three lines with where-now', () => {
		const lines = formatLines('primary', 'SPY', lv({ last: 704, changePct: 0.57, pmHigh: 710, pmLow: 690, orHigh: 705, orLow: 698, pdHigh: 720, pdLow: 680 }));
		expect(lines).toEqual([
			'**SPY 704.00** +0.57% · inside OR, below PMH',
			'PM 710.00 / 690.00 · OR 705.00 / 698.00',
			'PD 720.00 / 680.00 · C 700.00',
		]);
	});
	it('relative flags divergence from the primary', () => {
		const spy = lv({ changePct: 0.4 });
		expect(formatLines('relative', 'QQQ', lv({ last: 600, changePct: -0.3, pmHigh: 605, pmLow: 590 }), spy)[0])
			.toBe('**QQQ 600.00** -0.30% · inside PM · ⚠️ diverging');
		expect(formatLines('relative', 'QQQ', lv({ changePct: 0.2 }), spy)[0]).not.toContain('diverging');
	});
	it('vix, overnight, unavailable', () => {
		expect(formatLines('vix', 'VIX', lv({ last: 19.46, prevClose: 19.92 }))[0]).toBe('**VIX 19.46** -0.46 · elev');
		expect(formatLines('overnight', 'MCL', lv({ last: 86.75, overnightPct: 0.82 }))[0]).toBe('**MCL 86.75** +0.8% overnight');
		expect(formatLines('vix', 'VIX', null)).toEqual(['**VIX** unavailable']);
	});
});

// Minimal Yahoo chart payload: one premarket bar today plus a prior-day session.
function chartJson(timestamps: number[], closes: number[]) {
	return {
		chart: { result: [{
			meta: { previousClose: 700, regularMarketPrice: 700, regularMarketTime: timestamps[0] },
			timestamp: timestamps,
			indicators: { quote: [{ open: closes, high: closes, low: closes, close: closes }] },
		}] },
	};
}

describe('buildLevelsMessage', () => {
	afterEach(() => vi.unstubAllGlobals());
	const now = et('2026-11-09', 9, 58);

	it('returns null for the scheduled post when there are no regular bars today', async () => {
		const ts = [et('2026-11-06', 10), et('2026-11-09', 8)];
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => chartJson(ts, [700, 701]) })));
		expect(await buildLevelsMessage(now, { requireToday: true })).toBeNull();
		// on-demand still renders
		const msg = await buildLevelsMessage(now);
		expect(msg!.embeds[0].data.description).toContain('**SPY 701.00**');
	});

	it('posts a "levels unavailable" card when Yahoo fails', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
		const msg = await buildLevelsMessage(now, { requireToday: true });
		expect(msg!.embeds[0].data.description).toMatch(/unavailable/);
		expect(msg!.files).toHaveLength(0);
	});

	it('renders embed + chart on a normal day', async () => {
		const ts = [et('2026-11-06', 10), et('2026-11-09', 4), et('2026-11-09', 9, 30), et('2026-11-09', 9, 55)];
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => chartJson(ts, [700, 702, 703, 704]) })));
		const msg = (await buildLevelsMessage(now, { requireToday: true }))!;
		expect(msg.embeds[0].data.description!.split('\n').length).toBeLessThanOrEqual(8);
		expect(msg.embeds[0].data.footer!.text).toMatch(/tickers.*yahoo/);
		expect(msg.files).toHaveLength(1);
	});
});
