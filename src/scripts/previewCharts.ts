import { config } from 'dotenv';
config();
import * as fs from 'fs';
import * as path from 'path';
import { renderAssetChart, renderHistoryChart } from '../embeds/asset-chart';
import { renderWatchlistCard, rowFromPrice, rowFromHistory } from '../embeds/asset-watchlist';
import { PriceData, HistoryData, HistoryPoint, IntradaySeries, AssetType } from '../utils/priceApi';

// Offline preview harness. Renders the REAL chart renderers against synthetic
// fixtures so any chart change can be reviewed as a faithful PNG instead of a
// hand-drawn mockup. Output lands in temp/ (gitignored).
//
//   npm run preview-charts
//
// Fixtures are deterministic (seeded RNG) so output is stable across runs.

const OUT = path.resolve(__dirname, '../../temp');

let seed = 12345;
function rnd(): number {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff;
	return seed / 0x7fffffff;
}
function reseed(s: number): void {
	seed = s;
}

const TYPES: AssetType[] = ['stock', 'crypto', 'commodity'];
const RANGES = ['1w', '1m', '3m', 'ytd', '1y', '5y', 'all'];
const SYMBOLS: Record<AssetType, string> = { stock: 'AAPL', crypto: 'BTC', commodity: 'WTI' };
const NAMES: Record<AssetType, string> = { stock: 'Apple Inc.', crypto: 'Bitcoin USD', commodity: 'Crude Oil' };
const BASE: Record<AssetType, number> = { stock: 230, crypto: 64000, commodity: 78 };
const RANGE_POINTS: Record<string, number> = { '1w': 30, '1m': 22, '3m': 63, 'ytd': 120, '1y': 250, '5y': 260, 'all': 300 };
const RANGE_STEP: Record<string, number> = { '1w': 1800, '1m': 86400, '3m': 86400, 'ytd': 86400, '1y': 86400, '5y': 7 * 86400, 'all': 30 * 86400 };
const END = 1718800000;

function fundamentals(type: AssetType, base: number) {
	return {
		week52_high: +(base * 1.12).toFixed(2),
		week52_low: +(base * 0.7).toFixed(2),
		market_cap: type === 'stock' ? 3.1e12 : undefined,
		pe_ratio: type === 'stock' ? 31.2 : undefined,
		dividend_yield: type === 'stock' ? 0.44 : undefined,
		next_earnings: type === 'stock' ? END + 30 * 86400 : undefined,
	};
}

function buildIntraday(type: AssetType, down = false): PriceData {
	reseed(1000 + type.length + (down ? 1 : 0));
	const base = BASE[type];
	const regStart = END;
	const regEnd = regStart + Math.round(6.5 * 3600);
	const preStart = regStart - 2 * 3600;
	const postEnd = regEnd + 2 * 3600;
	const timestamps: number[] = [];
	const closes: (number | null)[] = [];
	const volumes: (number | null)[] = [];
	let p = base;
	for (let t = preStart; t <= postEnd; t += 300) {
		timestamps.push(t);
		p = Math.max(base * 0.9, p + (rnd() - (down ? 0.52 : 0.48)) * base * 0.004);
		closes.push(+p.toFixed(2));
		volumes.push(Math.round(rnd() * 1e6));
	}
	const nums = closes.filter((c): c is number => c != null);
	// Down-day prev close sits above the series, putting the prev line near the
	// panel top (the case where its label could collide with the strip above).
	const prevClose = +(base * (down ? 1.03 : 0.992)).toFixed(2);
	const price = nums[nums.length - 1];
	const intraday: IntradaySeries = { timestamps, closes, volumes, regular_start: regStart, regular_end: regEnd };
	return {
		symbol: SYMBOLS[type], name: NAMES[type], price, prev_close: prevClose,
		change_pct: ((price - prevClose) / prevClose) * 100,
		high: Math.max(...nums), low: Math.min(...nums), open: nums[0], volume: 42_000_000,
		regular_close: price, session: 'regular', intraday, source: 'yahoo',
		...fundamentals(type, base),
	};
}

// Realistic bar timestamps. 1w mimics real intraday data: 13 half-hour bars per
// 6h session across 5 days with overnight GAPS (the case that exposed clumped/
// overlapping candles). Other ranges are evenly stepped.
function sessionTimestamps(range: string): number[] {
	if (range === '1w') {
		const ts: number[] = [];
		for (let day = 4; day >= 0; day--) {
			const open = END - day * 86400 - 12 * 1800;
			for (let k = 0; k < 13; k++) ts.push(open + k * 1800);
		}
		return ts;
	}
	const n = RANGE_POINTS[range];
	const step = RANGE_STEP[range];
	return Array.from({ length: n }, (_, i) => END - (n - 1 - i) * step);
}

function buildHistory(range: string, type: AssetType): HistoryData {
	reseed(2000 + range.length * 7 + type.length);
	const base = BASE[type];
	const points: HistoryPoint[] = [];
	let p = base * 0.75;
	for (const t of sessionTimestamps(range)) {
		const o = p;
		const c = Math.max(base * 0.5, o + (rnd() - 0.45) * base * 0.03);
		const h = Math.max(o, c) + rnd() * base * 0.01;
		const l = Math.min(o, c) - rnd() * base * 0.01;
		points.push({ t, price: +c.toFixed(2), open: +o.toFixed(2), high: +h.toFixed(2), low: +l.toFixed(2), volume: Math.round(rnd() * 5e6) });
		p = c;
	}
	return { symbol: SYMBOLS[type], name: NAMES[type], range, points, source: 'yahoo', ...fundamentals(type, base) };
}

// Compact raw-data summary so the rendered candles can be checked against the
// underlying bars (count, the gap structure, and a few sample OHLCV rows).
function dumpRaw(label: string, data: HistoryData): string {
	const pts = data.points;
	const gaps = pts.slice(1).map((p, i) => p.t - pts[i].t);
	const minGap = Math.min(...gaps);
	const maxGap = Math.max(...gaps);
	const bar = (p: HistoryPoint) => `  t=${p.t} O=${p.open} H=${p.high} L=${p.low} C=${p.price} V=${p.volume}`;
	return [
		`### ${label} — ${pts.length} bars`,
		`gap min/max (s): ${minGap} / ${maxGap}${maxGap > minGap * 3 ? '   ← NON-UNIFORM (gaps present)' : ''}`,
		'first 3:', ...pts.slice(0, 3).map(bar),
		'last 3:', ...pts.slice(-3).map(bar),
		'',
	].join('\n');
}

function write(name: string, buf: Buffer | null): void {
	if (!buf) {
		console.warn(`  ✗ ${name} — renderer returned null`);
		return;
	}
	fs.writeFileSync(path.join(OUT, name), buf);
	console.log(`  ✓ ${name}`);
}

const MODES: Array<'line' | 'candle'> = ['line', 'candle'];

function main(): void {
	fs.mkdirSync(OUT, { recursive: true });
	console.log(`rendering preview charts → ${OUT}`);
	const raw: string[] = [];
	for (const type of TYPES) {
		const intraday = buildIntraday(type);
		for (const mode of MODES) {
			write(`preview-${type}-1d-${mode}.png`, renderAssetChart(intraday, type, undefined, mode));
		}
		if (type === 'stock') {
			const intradayDown = buildIntraday(type, true);
			for (const mode of MODES) {
				write(`preview-${type}-1d-down-${mode}.png`, renderAssetChart(intradayDown, type, undefined, mode));
			}
		}
		for (const range of RANGES) {
			const hist = buildHistory(range, type);
			for (const mode of MODES) {
				write(`preview-${type}-${range}-${mode}.png`, renderHistoryChart(hist, type, undefined, mode));
			}
			if (type === 'stock') raw.push(dumpRaw(`stock ${range}`, hist));
		}
	}
	// Watchlist (multi-ticker comparison) card at a live and a history window.
	const dayRows = TYPES.map(t => rowFromPrice(buildIntraday(t), t));
	write('preview-watchlist-1d.png', renderWatchlistCard(dayRows));
	const yearRows = TYPES.map(t => rowFromHistory(buildHistory('1y', t), t));
	write('preview-watchlist-1y.png', renderWatchlistCard(yearRows));

	fs.writeFileSync(path.join(OUT, 'preview-rawdata.txt'), raw.join('\n'));
	console.log(`done — raw data → ${path.join(OUT, 'preview-rawdata.txt')}`);
}

main();
