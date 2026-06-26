import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import * as path from 'path';
import { PriceData, AssetType, IntradaySeries, Session, HistoryData, RANGE_LABELS } from '../utils/priceApi';

// Register Inter so rendering is consistent across hosts. Without this canvas
// falls back to whatever sans-serif the OS happens to have (DejaVu on Debian)
// and the result looks visibly off.
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Inter-Regular.ttf'), 'Inter');
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Inter-Bold.ttf'), 'Inter');

const W = 800;
const H = 400;

const COLORS = {
	bg: '#2B2D31',
	panel: '#1E1F22',
	text: '#F2F3F5',
	dim: '#9BA1A8',
	grid: 'rgba(255,255,255,0.06)',
	prevLine: 'rgba(255,255,255,0.35)',
	sessionDivider: 'rgba(255,255,255,0.18)',
	extBg: 'rgba(255,255,255,0.025)',
};

export type ChartMode = 'line' | 'candle';

// Beyond this many bars the candle wicks render thinner than a pixel and turn to
// mush, so the renderer auto-falls back to a line. Exported so the button layer
// can predict which timeframes get a usable candle view.
export const MAX_CANDLES = 150;

// Ranges that stay candle-capable. 1y/5y/all carry ~250+ bars → always line.
// (1d is intraday and handled separately.) The renderer's pts.length cap is the
// real safety net; this is the cheap predicate for enabling the toggle button.
export function candleAllowed(range: string): boolean {
	return !['1y', '5y', 'all'].includes(range);
}

interface Candle {
	t: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
}

// Bottom-band volume histogram drawn BEHIND the price, scaled to its own band so
// a spike can't occlude the series. Each bar is tinted by its candle's direction
// (up/down color) at low alpha so it reads as context, not a second series.
// Candles/volume take precomputed per-bar x-positions (`xs`) rather than scaling
// by timestamp. History candle mode spaces bars evenly by index so non-trading
// gaps (nights, weekends) don't clump bars together or overlap them; the line
// path still scales by time. `slotW` is the per-bar slot used for body width.
function drawVolumeOverlay(
	ctx: any, candles: Candle[], xs: number[],
	chartY: number, chartH: number, slotW: number,
	upColor: string, downColor: string,
) {
	const vMax = Math.max(...candles.map(c => c.volume ?? 0));
	if (vMax <= 0) return;
	const bandH = chartH * 0.34;
	const w = Math.max(1, Math.min(slotW * 0.7, 14));
	candles.forEach((c, i) => {
		if (!c.volume) return;
		const h = (c.volume / vMax) * bandH;
		ctx.fillStyle = hexToRgba(c.close >= c.open ? upColor : downColor, 0.3);
		ctx.fillRect(xs[i] - w / 2, chartY + chartH - h, w, h);
	});
}

function drawCandles(
	ctx: any, candles: Candle[], xs: number[], yScale: (v: number) => number,
	upColor: string, downColor: string, slotW: number,
) {
	const w = Math.max(1, Math.min(slotW * 0.7, 14));
	candles.forEach((c, i) => {
		const col = c.close >= c.open ? upColor : downColor;
		const x = xs[i];
		ctx.strokeStyle = col;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, yScale(c.high));
		ctx.lineTo(x, yScale(c.low));
		ctx.stroke();
		const yo = yScale(c.open), yc = yScale(c.close);
		ctx.fillStyle = col;
		ctx.fillRect(x - w / 2, Math.min(yo, yc), w, Math.max(1, Math.abs(yc - yo)));
	});
}

// Price labels inside the plot at the right edge, each on a panel-colored backing
// so it stays legible where the price line/candles cross it. Drawn last (on top).
// Shared so both renderers align.
function drawYLabels(
	ctx: any, chartX: number, chartY: number, chartW: number, chartH: number,
	yMax: number, ySpan: number,
) {
	ctx.font = '11px Inter';
	ctx.textAlign = 'right';
	for (let g = 0; g <= 4; g++) {
		const y = chartY + (chartH / 4) * g;
		const label = `$${fmtPrice(yMax - (ySpan / 4) * g)}`;
		const lw = ctx.measureText(label).width;
		ctx.fillStyle = COLORS.panel;
		ctx.fillRect(chartX + chartW - lw - 8, y - 13, lw + 8, 14);
		ctx.fillStyle = COLORS.dim;
		ctx.fillText(label, chartX + chartW - 4, y - 3);
	}
	ctx.textAlign = 'left';
}

interface StripFundamentals {
	market_cap?: number;
	pe_ratio?: number;
	dividend_yield?: number;
	next_earnings?: number;
}

// One compact dim line of company identity, identical on every view (live or any
// timeframe). Omits missing fields, so ETFs/crypto/commodities show a shorter
// strip or none at all rather than gaps.
function drawFundamentalsStrip(ctx: any, fund: StripFundamentals, x: number, y: number) {
	const segs: string[] = [];
	if (fund.market_cap) segs.push(`MKT CAP  $${fmtCompact(fund.market_cap)}`);
	if (typeof fund.pe_ratio === 'number') {
		const s = fund.pe_ratio < 0 ? '−' : '';
		segs.push(`P/E  ${s}${Math.abs(fund.pe_ratio).toFixed(1)}`);
	}
	if (typeof fund.dividend_yield === 'number') segs.push(`DIV  ${fund.dividend_yield.toFixed(2)}%`);
	if (fund.next_earnings) {
		const d = new Date(fund.next_earnings * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
		segs.push(`NEXT ER  ${d}`);
	}
	if (!segs.length) return;
	// Divider above the strip, positioned so the gap above the text matches the
	// gap below it (the strip baseline is 8px above the chart panel top).
	ctx.strokeStyle = 'rgba(255,255,255,0.10)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x, y - 15);
	ctx.lineTo(W - 28, y - 15);
	ctx.stroke();
	ctx.font = '12.5px Inter';
	ctx.fillStyle = COLORS.dim;
	ctx.textAlign = 'left';
	ctx.fillText(segs.join('  ·  '), x, y);
}

// Horizontal range track ("where in the range is price now"). Shared by the live
// view (DAY / 52WK) and the history views (the interval's own low→high / 52WK).
function drawRangeBar(
	ctx: any, chartX: number, chartW: number, lineColor: string,
	label: string, lo: number, hi: number, cur: number, y: number,
) {
	ctx.fillStyle = COLORS.dim;
	ctx.font = '12px Inter';
	ctx.textAlign = 'left';
	ctx.fillText(label, chartX, y - 6);
	ctx.textAlign = 'right';
	ctx.fillText(`$${fmtPrice(lo)}  —  $${fmtPrice(hi)}`, chartX + chartW, y - 6);
	ctx.textAlign = 'left';
	const trackH = 6;
	ctx.fillStyle = '#3A3C42';
	ctx.fillRect(chartX, y, chartW, trackH);
	const ratio = Math.max(0, Math.min(1, (cur - lo) / Math.max(0.0001, hi - lo)));
	const pos = ratio * chartW;
	ctx.fillStyle = lineColor;
	ctx.fillRect(chartX, y, pos, trackH);
	ctx.fillStyle = '#FFFFFF';
	ctx.fillRect(chartX + pos - 1.5, y - 2, 3, trackH + 4);
}

interface TypeColors {
	line: string;
	lineDim: string;
	fill: string;
	fillDim: string;
}

const TYPE_PALETTE: Record<AssetType, { up: TypeColors; down: TypeColors }> = {
	stock: {
		up: { line: '#10B981', lineDim: 'rgba(16,185,129,0.45)', fill: 'rgba(16,185,129,0.20)', fillDim: 'rgba(16,185,129,0.07)' },
		down: { line: '#EF4444', lineDim: 'rgba(239,68,68,0.45)', fill: 'rgba(239,68,68,0.20)', fillDim: 'rgba(239,68,68,0.07)' },
	},
	crypto: {
		up: { line: '#F7931A', lineDim: 'rgba(247,147,26,0.45)', fill: 'rgba(247,147,26,0.20)', fillDim: 'rgba(247,147,26,0.07)' },
		down: { line: '#F7931A', lineDim: 'rgba(247,147,26,0.45)', fill: 'rgba(247,147,26,0.20)', fillDim: 'rgba(247,147,26,0.07)' },
	},
	commodity: {
		up: { line: '#7AA8D4', lineDim: 'rgba(122,168,212,0.45)', fill: 'rgba(122,168,212,0.20)', fillDim: 'rgba(122,168,212,0.07)' },
		down: { line: '#7AA8D4', lineDim: 'rgba(122,168,212,0.45)', fill: 'rgba(122,168,212,0.20)', fillDim: 'rgba(122,168,212,0.07)' },
	},
};

function fmt(v: number, d = 2): string {
	return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPrice(v: number): string {
	return v >= 1 ? fmt(v, 2) : v.toFixed(4);
}

function fmtCompact(v: number): string {
	const abs = Math.abs(v);
	if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
	if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
	return v.toFixed(0);
}

function hexToRgba(hex: string, a: number): string {
	const n = parseInt(hex.replace('#', ''), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

interface CleanedPoint {
	t: number;
	price: number;
	volume?: number;
}

function cleanSeries(intraday: IntradaySeries): CleanedPoint[] {
	const pts: CleanedPoint[] = [];
	for (let i = 0; i < intraday.timestamps.length; i++) {
		const c = intraday.closes[i];
		if (c == null) continue;
		const v = intraday.volumes?.[i];
		pts.push({ t: intraday.timestamps[i], price: c, volume: v == null ? undefined : v });
	}
	return pts;
}

export function renderAssetChart(price: PriceData, type: AssetType, displayName?: string, mode: ChartMode = 'line'): Buffer | null {
	if (!price.intraday) return null;
	const series = cleanSeries(price.intraday);
	if (series.length < 2) return null;

	const isUp = price.change_pct >= 0;
	const palette = TYPE_PALETTE[type][isUp ? 'up' : 'down'];

	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext('2d');

	ctx.fillStyle = COLORS.bg;
	ctx.fillRect(0, 0, W, H);

	const company = displayName ?? price.name;
	if (company) {
		ctx.fillStyle = COLORS.dim;
		ctx.font = '13px Inter';
		ctx.fillText(company.toUpperCase(), 28, 30);
	}

	ctx.fillStyle = COLORS.text;
	ctx.font = 'bold 34px Inter';
	ctx.fillText(price.symbol, 28, 64);
	const tickerW = ctx.measureText(price.symbol).width;

	ctx.fillStyle = palette.line;
	ctx.fillText(`$${fmtPrice(price.price)}`, 28 + tickerW + 16, 64);
	const priceStr = `$${fmtPrice(price.price)}`;
	const priceW = ctx.measureText(priceStr).width;

	const sessionLabel = sessionTag(price.session);
	if (sessionLabel) {
		const tagX = 28 + tickerW + 16 + priceW + 10;
		ctx.fillStyle = 'rgba(155,161,168,0.25)';
		ctx.fillRect(tagX, 40, 38, 22);
		ctx.fillStyle = COLORS.dim;
		ctx.font = 'bold 12px Inter';
		ctx.fillText(sessionLabel, tagX + (38 - ctx.measureText(sessionLabel).width) / 2, 56);
	}

	const extPrice = price.session === 'pre' ? price.pre_market_price
		: price.session === 'post' ? price.post_market_price
			: undefined;
	const extActive = extPrice != null && price.regular_close != null;

	// Big headline change is measured against whatever the headline price prints
	// against — the last regular close during an extended session, else prev close
	// — so the prominent number and its change always agree.
	const headBase = extActive ? price.regular_close! : price.prev_close;
	const headChange = price.price - headBase;
	const headPct = headBase ? (headChange / headBase) * 100 : 0;
	const headArrow = headChange >= 0 ? '▲' : '▼';
	const headSign = headChange >= 0 ? '+' : '-';
	ctx.fillStyle = headChange >= 0 ? palette.line : TYPE_PALETTE[type].down.line;
	ctx.font = '18px Inter';
	ctx.fillText(
		`${headArrow} ${headSign}$${fmt(Math.abs(headChange))}  (${headSign}${Math.abs(headPct).toFixed(2)}%)`,
		28, 92,
	);

	// Secondary line during extended hours: the regular-session close the extended
	// price is trading away from.
	if (extActive) {
		const regChange = price.regular_close! - price.prev_close;
		const regPct = price.prev_close ? (regChange / price.prev_close) * 100 : 0;
		const regSign = regChange >= 0 ? '+' : '-';
		ctx.fillStyle = COLORS.dim;
		ctx.font = '13px Inter';
		ctx.fillText(
			`at close  $${fmtPrice(price.regular_close!)}  ${regSign}$${fmt(Math.abs(regChange))} (${regSign}${Math.abs(regPct).toFixed(2)}%)`,
			28, 108,
		);
	}

	// Right-side stat list — price action for the current window. Company identity
	// (mkt cap / P/E / div / earnings) lives in the fundamentals strip so the list
	// is identical across the live and history views.
	const stats: Array<{ label: string; value: string }> = [
		{ label: 'PREV CLOSE', value: `$${fmtPrice(price.prev_close)}` },
	];
	if (price.open) stats.push({ label: 'OPEN', value: `$${fmtPrice(price.open)}` });
	if (price.high > 0) stats.push({ label: 'HIGH', value: `$${fmtPrice(price.high)}` });
	if (price.low > 0) stats.push({ label: 'LOW', value: `$${fmtPrice(price.low)}` });

	const statsRight = W - 28;
	const statsLeft = statsRight - 170;
	const statRowH = 20;
	const statsTop = 38;
	ctx.font = '13px Inter';
	for (let i = 0; i < stats.length; i++) {
		const y = statsTop + i * statRowH;
		ctx.textAlign = 'left';
		ctx.fillStyle = COLORS.dim;
		ctx.fillText(stats[i].label, statsLeft, y);
		ctx.textAlign = 'right';
		ctx.fillStyle = COLORS.text;
		ctx.fillText(stats[i].value, statsRight, y);
	}
	ctx.textAlign = 'left';

	// Chart panel
	const chartX = 28, chartY = 130, chartW = W - 56, chartH = 195;
	ctx.fillStyle = COLORS.panel;
	ctx.fillRect(chartX, chartY, chartW, chartH);

	// Candle bodies derived from consecutive closes (intraday series has no real
	// per-bar OHLC); volume rides the intraday volume array.
	const candles: Candle[] = series.map((p, i) => {
		const open = i === 0 ? p.price : series[i - 1].price;
		return { t: p.t, open, high: Math.max(open, p.price), low: Math.min(open, p.price), close: p.price, volume: p.volume };
	});

	const tMin = series[0].t;
	const tMax = series[series.length - 1].t;
	const span = Math.max(1, tMax - tMin);
	const xScale = (t: number) => chartX + ((t - tMin) / span) * chartW;

	const prices = series.map(p => p.price);
	const yMin = Math.min(...prices, price.prev_close) - 0.2;
	const yMax = Math.max(...prices, price.prev_close) + 0.2;
	const ySpan = Math.max(0.01, yMax - yMin);
	const yScale = (v: number) => chartY + chartH - ((v - yMin) / ySpan) * chartH;

	// Extended-hours dimming bands
	const regStart = Math.max(price.intraday.regular_start, tMin);
	const regEnd = Math.min(price.intraday.regular_end, tMax);
	const regStartX = xScale(regStart);
	const regEndX = xScale(regEnd);
	if (regStartX > chartX) {
		ctx.fillStyle = COLORS.extBg;
		ctx.fillRect(chartX, chartY, regStartX - chartX, chartH);
	}
	if (regEndX < chartX + chartW) {
		ctx.fillStyle = COLORS.extBg;
		ctx.fillRect(regEndX, chartY, chartX + chartW - regEndX, chartH);
	}

	// Session dividers (only when we actually have extended-hours data on either side)
	ctx.strokeStyle = COLORS.sessionDivider;
	ctx.setLineDash([3, 4]);
	ctx.lineWidth = 1;
	function vLine(x: number) {
		ctx.beginPath();
		ctx.moveTo(x, chartY);
		ctx.lineTo(x, chartY + chartH);
		ctx.stroke();
	}
	if (regStartX > chartX + 1) vLine(regStartX);
	if (regEndX < chartX + chartW - 1) vLine(regEndX);
	ctx.setLineDash([]);

	// Gridlines
	ctx.strokeStyle = COLORS.grid;
	ctx.lineWidth = 1;
	function hLine(y: number) {
		ctx.beginPath();
		ctx.moveTo(chartX, y);
		ctx.lineTo(chartX + chartW, y);
		ctx.stroke();
	}
	for (let g = 1; g < 4; g++) {
		hLine(chartY + (chartH / 4) * g);
	}

	// Prev close reference line
	ctx.strokeStyle = COLORS.prevLine;
	ctx.setLineDash([4, 4]);
	const py = yScale(price.prev_close);
	hLine(py);
	ctx.setLineDash([]);
	ctx.fillStyle = COLORS.dim;
	ctx.font = '11px Inter';
	// Label sits above the line, but drops below it when the line is near the panel
	// top (a down day) so it doesn't collide with the fundamentals strip above.
	const prevLabelY = py - 4 < chartY + 14 ? py + 13 : py - 4;
	ctx.fillText(`prev $${fmtPrice(price.prev_close)}`, chartX + 6, prevLabelY);

	// Split series into pre / regular / post slices for differentiated styling
	const preSlice = series.filter(p => p.t <= regStart);
	const regSlice = series.filter(p => p.t >= regStart && p.t <= regEnd);
	const postSlice = series.filter(p => p.t >= regEnd);

	function fillSlice(slice: CleanedPoint[], fillStyle: string) {
		if (slice.length < 2) return;
		ctx.beginPath();
		ctx.moveTo(xScale(slice[0].t), chartY + chartH);
		for (const p of slice) ctx.lineTo(xScale(p.t), yScale(p.price));
		ctx.lineTo(xScale(slice[slice.length - 1].t), chartY + chartH);
		ctx.closePath();
		ctx.fillStyle = fillStyle;
		ctx.fill();
	}
	function strokeSlice(slice: CleanedPoint[], strokeStyle: string, lineWidth: number) {
		if (slice.length < 2) return;
		ctx.strokeStyle = strokeStyle;
		ctx.lineWidth = lineWidth;
		ctx.beginPath();
		for (let i = 0; i < slice.length; i++) {
			const x = xScale(slice[i].t);
			const y = yScale(slice[i].price);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	}

	if (mode === 'candle') {
		// Intraday bars are contiguous (one session), so time-based x keeps them
		// aligned with the session-dimming bands.
		const slotW = chartW / candles.length;
		const xs = candles.map(c => xScale(c.t));
		drawVolumeOverlay(ctx, candles, xs, chartY, chartH, slotW, palette.line, TYPE_PALETTE[type].down.line);
		drawCandles(ctx, candles, xs, yScale, palette.line, TYPE_PALETTE[type].down.line, slotW);
	}
	else {
		fillSlice(preSlice, palette.fillDim);
		fillSlice(regSlice, palette.fill);
		fillSlice(postSlice, palette.fillDim);
		strokeSlice(preSlice, palette.lineDim, 1.6);
		strokeSlice(regSlice, palette.line, 2.2);
		strokeSlice(postSlice, palette.lineDim, 1.6);

		// End dot at last actual point
		const lastPt = series[series.length - 1];
		const inExt = lastPt.t < regStart || lastPt.t > regEnd;
		ctx.fillStyle = palette.line;
		ctx.beginPath();
		ctx.arc(xScale(lastPt.t), yScale(lastPt.price), inExt ? 3 : 4.5, 0, Math.PI * 2);
		ctx.fill();
		if (inExt) {
			ctx.strokeStyle = palette.lineDim;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(xScale(lastPt.t), yScale(lastPt.price), 5, 0, Math.PI * 2);
			ctx.stroke();
		}
	}

	// Y-axis price labels inside the plot at the right edge
	drawYLabels(ctx, chartX, chartY, chartW, chartH, yMax, ySpan);

	// Day & 52wk range tracks. Shown in both modes — volume is an in-panel overlay
	// now, so the space below the chart is free regardless of line vs candle.
	const barY = chartY + chartH + 24;
	if (price.low > 0 && price.high > price.low) {
		drawRangeBar(
			ctx, chartX, chartW, palette.line, 'DAY',
			price.low, price.high, price.regular_close ?? price.price, barY,
		);
	}
	if (price.week52_low && price.week52_high && price.week52_high > price.week52_low) {
		drawRangeBar(
			ctx, chartX, chartW, palette.line, '52WK',
			price.week52_low, price.week52_high, price.price, barY + 34,
		);
	}

	drawFundamentalsStrip(ctx, price, 28, 122);

	return canvas.toBuffer('image/png');
}

function sessionTag(session: Session | undefined): string | null {
	if (session === 'pre') return 'PRE';
	if (session === 'post') return 'AH';
	return null;
}

function formatAxisDate(tSec: number, spanDays: number): string {
	const d = new Date(tSec * 1000);
	if (spanDays <= 7) return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
	if (spanDays <= 370) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// Multi-day timeframe chart. Deliberately simpler than the intraday renderer:
// no session bands or extended-hours styling (irrelevant beyond 1d). Change and
// the dashed baseline are measured from the first point of the window, so the
// percent reflects the selected timeframe rather than yesterday's close.
export function renderHistoryChart(data: HistoryData, type: AssetType, displayName?: string, mode: ChartMode = 'line'): Buffer | null {
	const pts = data.points;
	if (pts.length < 2) return null;

	// Density cap: beyond MAX_CANDLES the candles smear, so fall back to a line.
	const effMode: ChartMode = mode === 'candle' && pts.length <= MAX_CANDLES ? 'candle' : 'line';

	const first = pts[0].price;
	const last = pts[pts.length - 1].price;
	const change = last - first;
	const pct = first !== 0 ? (change / first) * 100 : 0;
	const isUp = change >= 0;
	const palette = TYPE_PALETTE[type][isUp ? 'up' : 'down'];
	const downColor = TYPE_PALETTE[type].down.line;

	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = COLORS.bg;
	ctx.fillRect(0, 0, W, H);

	const company = displayName ?? data.name;
	if (company) {
		ctx.fillStyle = COLORS.dim;
		ctx.font = '13px Inter';
		ctx.fillText(company.toUpperCase(), 28, 30);
	}

	ctx.fillStyle = COLORS.text;
	ctx.font = 'bold 34px Inter';
	ctx.fillText(data.symbol, 28, 64);
	const tickerW = ctx.measureText(data.symbol).width;

	ctx.fillStyle = palette.line;
	const priceStr = `$${fmtPrice(last)}`;
	ctx.fillText(priceStr, 28 + tickerW + 16, 64);
	const priceW = ctx.measureText(priceStr).width;

	const rangeLabel = RANGE_LABELS[data.range] ?? data.range.toUpperCase();
	const badgeX = 28 + tickerW + 16 + priceW + 12;
	ctx.font = 'bold 12px Inter';
	const badgeW = ctx.measureText(rangeLabel).width + 14;
	ctx.fillStyle = 'rgba(155,161,168,0.22)';
	ctx.fillRect(badgeX, 42, badgeW, 22);
	ctx.fillStyle = COLORS.dim;
	ctx.fillText(rangeLabel, badgeX + 7, 57);

	const arrow = isUp ? '▲' : '▼';
	const sign = isUp ? '+' : '-';
	ctx.fillStyle = isUp ? palette.line : downColor;
	ctx.font = '18px Inter';
	const changeText = `${arrow} ${sign}$${fmt(Math.abs(change))}  (${sign}${Math.abs(pct).toFixed(2)}%)`;
	ctx.fillText(changeText, 28, 92);
	// "over <range>" sits next to the change rather than on its own line
	const changeW = ctx.measureText(changeText).width;
	ctx.fillStyle = COLORS.dim;
	ctx.font = '13px Inter';
	ctx.fillText(`over ${rangeLabel}`, 28 + changeW + 12, 92);

	const prices = pts.map(p => p.price);
	const hi = Math.max(...prices);
	const lo = Math.min(...prices);
	// True interval high/low includes each bar's intraday extremes (not just
	// closes), so HIGH/LOW and the range bar match the same basis Yahoo uses for
	// its 52-week range. The chart y-scale still uses closes (line) / wicks (candle).
	const trueHi = Math.max(...pts.map(p => p.high ?? p.price));
	const trueLo = Math.min(...pts.map(p => p.low ?? p.price));
	// Same four labels as the live view; values are window-relative (the dashed
	// baseline and "over <range>" header make clear PREV CLOSE = window start).
	const stats: Array<{ label: string; value: string }> = [
		{ label: 'PREV CLOSE', value: `$${fmtPrice(first)}` },
		{ label: 'OPEN', value: `$${fmtPrice(pts[0].open ?? first)}` },
		{ label: 'HIGH', value: `$${fmtPrice(trueHi)}` },
		{ label: 'LOW', value: `$${fmtPrice(trueLo)}` },
	];
	const statsRight = W - 28;
	const statsLeft = statsRight - 150;
	const statRowH = 20;
	const statsTop = 38;
	ctx.font = '13px Inter';
	for (let i = 0; i < stats.length; i++) {
		const y = statsTop + i * statRowH;
		ctx.textAlign = 'left';
		ctx.fillStyle = COLORS.dim;
		ctx.fillText(stats[i].label, statsLeft, y);
		ctx.textAlign = 'right';
		ctx.fillStyle = COLORS.text;
		ctx.fillText(stats[i].value, statsRight, y);
	}
	ctx.textAlign = 'left';

	// 52WK track is shown except on the 1Y view, where it just duplicates the
	// interval range. With only one range bar the panel grows to fill the space.
	const showWk52 = data.range !== '1y' && !!(data.week52_low && data.week52_high && data.week52_high > data.week52_low);
	const chartX = 28, chartY = 130, chartW = W - 56, chartH = showWk52 ? 178 : 202;
	ctx.fillStyle = COLORS.panel;
	ctx.fillRect(chartX, chartY, chartW, chartH);

	// Candle bodies (real OHLC from the history bars; the appended live tick is
	// close-only → renders as a doji). Y-range must include wick extremes.
	const candles: Candle[] = pts.map(p => ({
		t: p.t, open: p.open ?? p.price, high: p.high ?? p.price, low: p.low ?? p.price, close: p.price, volume: p.volume,
	}));
	let dataLo = lo, dataHi = hi;
	if (effMode === 'candle') {
		for (const c of candles) {
			dataLo = Math.min(dataLo, c.low);
			dataHi = Math.max(dataHi, c.high);
		}
	}

	const tMin = pts[0].t;
	const tMax = pts[pts.length - 1].t;
	const span = Math.max(1, tMax - tMin);
	const xScale = (t: number) => chartX + ((t - tMin) / span) * chartW;
	const pad = (dataHi - dataLo) * 0.08 || dataHi * 0.02 || 1;
	const yMin = Math.min(dataLo, first) - pad;
	const yMax = Math.max(dataHi, first) + pad;
	const ySpan = Math.max(0.0001, yMax - yMin);
	const yScale = (v: number) => chartY + chartH - ((v - yMin) / ySpan) * chartH;

	// Candle mode spaces bars evenly by index (so overnight/weekend gaps don't
	// clump or overlap them); the line path scales by time.
	const slotW = chartW / candles.length;
	const candleXs = candles.map((_, i) => chartX + (i + 0.5) * slotW);

	// Gridlines (labels drawn later, on top of the price line)
	ctx.lineWidth = 1;
	ctx.strokeStyle = COLORS.grid;
	for (let g = 0; g <= 4; g++) {
		const y = chartY + (chartH / 4) * g;
		ctx.beginPath();
		ctx.moveTo(chartX, y);
		ctx.lineTo(chartX + chartW, y);
		ctx.stroke();
	}

	// Volume histogram behind the price (candle mode only)
	if (effMode === 'candle') drawVolumeOverlay(ctx, candles, candleXs, chartY, chartH, slotW, palette.line, downColor);

	// Window-start baseline
	ctx.strokeStyle = COLORS.prevLine;
	ctx.setLineDash([4, 4]);
	const by = yScale(first);
	ctx.beginPath();
	ctx.moveTo(chartX, by);
	ctx.lineTo(chartX + chartW, by);
	ctx.stroke();
	ctx.setLineDash([]);

	if (effMode === 'candle') {
		drawCandles(ctx, candles, candleXs, yScale, palette.line, downColor, slotW);
	}
	else {
		ctx.beginPath();
		ctx.moveTo(xScale(pts[0].t), chartY + chartH);
		for (const p of pts) ctx.lineTo(xScale(p.t), yScale(p.price));
		ctx.lineTo(xScale(pts[pts.length - 1].t), chartY + chartH);
		ctx.closePath();
		ctx.fillStyle = palette.fill;
		ctx.fill();

		ctx.strokeStyle = palette.line;
		ctx.lineWidth = 2;
		ctx.beginPath();
		pts.forEach((p, i) => {
			const x = xScale(p.t);
			const y = yScale(p.price);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.stroke();

		ctx.fillStyle = palette.line;
		ctx.beginPath();
		ctx.arc(xScale(pts[pts.length - 1].t), yScale(last), 4, 0, Math.PI * 2);
		ctx.fill();
	}

	// Y-axis price labels inside the plot at the right edge
	drawYLabels(ctx, chartX, chartY, chartW, chartH, yMax, ySpan);

	// X-axis date labels. In candle mode they track evenly-spaced bar indices (to
	// match the candles); in line mode they track time.
	const labelCount = 5;
	const spanDays = span / 86400;
	ctx.fillStyle = COLORS.dim;
	ctx.font = '11px Inter';
	for (let i = 0; i <= labelCount; i++) {
		let center: number, t: number;
		if (effMode === 'candle') {
			const idx = Math.round((pts.length - 1) * (i / labelCount));
			center = candleXs[idx];
			t = pts[idx].t;
		}
		else {
			t = tMin + (span / labelCount) * i;
			center = xScale(t);
		}
		const label = formatAxisDate(t, spanDays);
		const w = ctx.measureText(label).width;
		const lx = Math.max(chartX, Math.min(chartX + chartW - w, center - w / 2));
		ctx.fillText(label, lx, chartY + chartH + 18);
	}

	// Range tracks: the interval's own low→high, then the 52-week range — same
	// "where in the range is price" read as the live view's DAY / 52WK bars. The
	// 52WK track is hidden on the 1Y view, where it just duplicates the interval.
	const rangeBarY = chartY + chartH + 42;
	if (trueHi > trueLo) {
		drawRangeBar(ctx, chartX, chartW, palette.line, rangeLabel, trueLo, trueHi, last, rangeBarY);
	}
	if (showWk52) {
		drawRangeBar(ctx, chartX, chartW, palette.line, '52WK', data.week52_low!, data.week52_high!, last, rangeBarY + 34);
	}

	drawFundamentalsStrip(ctx, data, 28, 122);

	return canvas.toBuffer('image/png');
}
