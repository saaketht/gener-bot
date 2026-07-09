import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import * as path from 'path';
import { PriceData, HistoryData, AssetType, RANGE_LABELS } from '../utils/priceApi';

GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Inter-Regular.ttf'), 'Inter');
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Inter-Bold.ttf'), 'Inter');

const W = 800;
const ROW_H = 100;
const PAD_Y = 16;
const PAD_X = 24;

const COLORS = {
	bg: '#2B2D31',
	rowAlt: '#26282C',
	panel: '#1E1F22',
	text: '#F2F3F5',
	dim: '#9BA1A8',
	track: '#3A3C42',
	prevLine: 'rgba(255,255,255,0.30)',
	divider: 'rgba(255,255,255,0.05)',
};

interface UpDown { line: string; fill: string }

const TYPE_PALETTE: Record<AssetType, { up: UpDown; down: UpDown }> = {
	stock: {
		up: { line: '#10B981', fill: 'rgba(16,185,129,0.22)' },
		down: { line: '#EF4444', fill: 'rgba(239,68,68,0.22)' },
	},
	crypto: {
		up: { line: '#F7931A', fill: 'rgba(247,147,26,0.22)' },
		down: { line: '#F7931A', fill: 'rgba(247,147,26,0.22)' },
	},
	commodity: {
		up: { line: '#7AA8D4', fill: 'rgba(122,168,212,0.22)' },
		down: { line: '#7AA8D4', fill: 'rgba(122,168,212,0.22)' },
	},
};

interface SeriesPoint { t: number; price: number }

// Normalized row the renderer consumes — works for the live (1d) view or any
// history window. Built from a PriceData or HistoryData via the helpers below.
export interface WatchlistRow {
	symbol: string;
	displayName?: string;
	type: AssetType;
	rangeLabel: string;
	last: number;
	changeAbs: number;
	changePct: number;
	baseline: number;
	series: SeriesPoint[];
	rangeLo?: number;
	rangeHi?: number;
	week52Lo?: number;
	week52Hi?: number;
}

function fmt(v: number, d = 2): string {
	return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPrice(v: number): string {
	return v >= 1 ? fmt(v, 2) : v.toFixed(4);
}

// Live (1d) row: intraday series, change vs prev close, day + 52wk ranges.
export function rowFromPrice(price: PriceData, type: AssetType, displayName?: string): WatchlistRow {
	const series: SeriesPoint[] = [];
	const intraday = price.intraday;
	if (intraday) {
		for (let i = 0; i < intraday.timestamps.length; i++) {
			const c = intraday.closes[i];
			if (c != null) series.push({ t: intraday.timestamps[i], price: c });
		}
	}
	return {
		symbol: price.symbol, displayName: displayName ?? price.name, type, rangeLabel: 'DAY',
		last: price.price, changeAbs: price.price - price.prev_close, changePct: price.change_pct,
		baseline: price.prev_close, series,
		rangeLo: price.low, rangeHi: price.high,
		week52Lo: price.week52_low, week52Hi: price.week52_high,
	};
}

// History (window) row: window series, change vs the window's first point, the
// interval's own low→high (intraday-inclusive) and the 52wk range.
export function rowFromHistory(data: HistoryData, type: AssetType, displayName?: string): WatchlistRow {
	const series: SeriesPoint[] = data.points.map(p => ({ t: p.t, price: p.price }));
	const first = series[0]?.price ?? 0;
	const last = series[series.length - 1]?.price ?? first;
	return {
		symbol: data.symbol, displayName: displayName ?? data.name, type,
		rangeLabel: RANGE_LABELS[data.range] ?? data.range.toUpperCase(),
		last, changeAbs: last - first, changePct: first ? ((last - first) / first) * 100 : 0,
		baseline: first, series,
		rangeLo: Math.min(...data.points.map(p => p.low ?? p.price)),
		rangeHi: Math.max(...data.points.map(p => p.high ?? p.price)),
		week52Lo: data.week52_low, week52Hi: data.week52_high,
	};
}

export function renderWatchlistCard(rows: WatchlistRow[]): Buffer | null {
	if (rows.length < 2) return null;

	const H = PAD_Y * 2 + rows.length * ROW_H;
	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext('2d');

	ctx.fillStyle = COLORS.bg;
	ctx.fillRect(0, 0, W, H);

	for (let i = 0; i < rows.length; i++) {
		drawRow(ctx, rows[i], PAD_Y + i * ROW_H, i);
		if (i < rows.length - 1) {
			ctx.fillStyle = COLORS.divider;
			ctx.fillRect(PAD_X, PAD_Y + (i + 1) * ROW_H - 1, W - 2 * PAD_X, 1);
		}
	}

	return canvas.toBuffer('image/png');
}

// Distinct per-ticker line colors for the overlay (each ticker gets its own hue
// regardless of asset type, so lines are told apart by the legend).
const OVERLAY_COLORS = ['#3B82F6', '#F59E0B', '#EC4899', '#34D399', '#A78BFA', '#22D3EE'];

function fmtOverlayDate(tSec: number, spanDays: number): string {
	const d = new Date(tSec * 1000);
	if (spanDays <= 7) return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
	if (spanDays <= 370) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// "Who outperformed" view: every ticker's series rebased to % change from the
// window's start, drawn on one axis with a legend. All lines begin at 0%.
export function renderComparisonOverlay(rows: WatchlistRow[], rangeLabel: string): Buffer | null {
	const usable = rows.filter(r => r.series.length >= 2);
	if (usable.length < 2) return null;

	const H = 420;
	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = COLORS.bg;
	ctx.fillRect(0, 0, W, H);

	const lines = usable.map((r, i) => {
		const base = r.series[0].price || 1;
		return {
			symbol: r.symbol,
			color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
			pct: r.changePct,
			pts: r.series.map(p => ({ t: p.t, v: ((p.price - base) / base) * 100 })),
		};
	});

	// Title + legend
	ctx.fillStyle = COLORS.dim;
	ctx.font = '13px Inter';
	ctx.fillText(`NORMALIZED  ·  ${rangeLabel}`, 28, 30);
	let lx = 28;
	const legendY = 56;
	for (const l of lines) {
		ctx.fillStyle = l.color;
		ctx.beginPath();
		ctx.arc(lx + 5, legendY - 4, 5, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = COLORS.text;
		ctx.font = 'bold 14px Inter';
		ctx.fillText(l.symbol, lx + 16, legendY);
		const symW = ctx.measureText(l.symbol).width;
		ctx.fillStyle = l.color;
		ctx.font = '13px Inter';
		const pctStr = `${l.pct >= 0 ? '+' : ''}${l.pct.toFixed(2)}%`;
		ctx.fillText(pctStr, lx + 16 + symW + 8, legendY);
		lx += 16 + symW + 8 + ctx.measureText(pctStr).width + 26;
	}

	// Plot panel
	const chartX = 28, chartY = 78, chartW = W - 56, chartH = H - chartY - 34;
	ctx.fillStyle = COLORS.panel;
	ctx.fillRect(chartX, chartY, chartW, chartH);

	let tMin = Infinity, tMax = -Infinity, vMin = 0, vMax = 0;
	for (const l of lines) {
		for (const p of l.pts) {
			if (p.t < tMin) tMin = p.t;
			if (p.t > tMax) tMax = p.t;
			if (p.v < vMin) vMin = p.v;
			if (p.v > vMax) vMax = p.v;
		}
	}
	const tSpan = Math.max(1, tMax - tMin);
	const vPad = (vMax - vMin) * 0.1 || 1;
	vMin -= vPad; vMax += vPad;
	const vSpan = Math.max(0.01, vMax - vMin);
	const xS = (t: number) => chartX + ((t - tMin) / tSpan) * chartW;
	const yS = (v: number) => chartY + chartH - ((v - vMin) / vSpan) * chartH;

	// Gridlines
	ctx.strokeStyle = 'rgba(255,255,255,0.06)';
	ctx.lineWidth = 1;
	for (let g = 0; g <= 4; g++) {
		const y = chartY + (chartH / 4) * g;
		ctx.beginPath();
		ctx.moveTo(chartX, y);
		ctx.lineTo(chartX + chartW, y);
		ctx.stroke();
	}

	// 0% baseline (all lines start here)
	if (vMin < 0 && vMax > 0) {
		ctx.strokeStyle = COLORS.prevLine;
		ctx.setLineDash([4, 4]);
		ctx.beginPath();
		ctx.moveTo(chartX, yS(0));
		ctx.lineTo(chartX + chartW, yS(0));
		ctx.stroke();
		ctx.setLineDash([]);
	}

	// Lines
	for (const l of lines) {
		ctx.strokeStyle = l.color;
		ctx.lineWidth = 2;
		ctx.beginPath();
		l.pts.forEach((p, i) => {
			const x = xS(p.t), y = yS(p.v);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.stroke();
		const end = l.pts[l.pts.length - 1];
		ctx.fillStyle = l.color;
		ctx.beginPath();
		ctx.arc(xS(end.t), yS(end.v), 3.5, 0, Math.PI * 2);
		ctx.fill();
	}

	// Y-axis % labels inside the right edge (on a backing so lines don't obscure)
	ctx.font = '11px Inter';
	ctx.textAlign = 'right';
	for (let g = 0; g <= 4; g++) {
		const y = chartY + (chartH / 4) * g;
		const val = vMax - (vSpan / 4) * g;
		const label = `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`;
		const lw = ctx.measureText(label).width;
		ctx.fillStyle = COLORS.panel;
		ctx.fillRect(chartX + chartW - lw - 8, y - 13, lw + 8, 14);
		ctx.fillStyle = COLORS.dim;
		ctx.fillText(label, chartX + chartW - 4, y - 3);
	}
	ctx.textAlign = 'left';

	// X-axis dates
	const spanDays = tSpan / 86400;
	ctx.fillStyle = COLORS.dim;
	ctx.font = '11px Inter';
	for (let i = 0; i <= 5; i++) {
		const t = tMin + (tSpan / 5) * i;
		const label = fmtOverlayDate(t, spanDays);
		const w = ctx.measureText(label).width;
		const lxx = Math.max(chartX, Math.min(chartX + chartW - w, xS(t) - w / 2));
		ctx.fillText(label, lxx, chartY + chartH + 18);
	}

	return canvas.toBuffer('image/png');
}

function drawRow(ctx: any, row: WatchlistRow, top: number, idx: number) {
	const isUp = row.changePct >= 0;
	const palette = TYPE_PALETTE[row.type][isUp ? 'up' : 'down'];

	if (idx % 2 === 1) {
		ctx.fillStyle = COLORS.rowAlt;
		ctx.fillRect(PAD_X, top, W - 2 * PAD_X, ROW_H);
	}

	const rowInner = top + 8;

	// Column 1: ticker + company name
	ctx.fillStyle = COLORS.text;
	ctx.font = 'bold 22px Inter';
	ctx.fillText(row.symbol, PAD_X + 8, rowInner + 22);

	if (row.displayName) {
		ctx.fillStyle = COLORS.dim;
		ctx.font = '12px Inter';
		const truncated = row.displayName.length > 28 ? row.displayName.slice(0, 26) + '…' : row.displayName;
		ctx.fillText(truncated, PAD_X + 8, rowInner + 42);
	}

	// Range mini-bars (col 1 + col 2 bottom row): the interval's own range, then 52wk
	if (row.rangeLo != null && row.rangeHi != null && row.rangeHi > row.rangeLo) {
		drawMiniRange(ctx, row.rangeLabel, row.rangeLo, row.rangeHi, row.last, palette.line, PAD_X + 8, rowInner + 60, 160);
	}
	if (row.week52Lo != null && row.week52Hi != null && row.week52Hi > row.week52Lo) {
		drawMiniRange(ctx, '52W', row.week52Lo, row.week52Hi, row.last, palette.line, PAD_X + 230, rowInner + 60, 160);
	}

	// Column 2: price + change (with the timeframe so the window is clear)
	const priceX = PAD_X + 230;
	ctx.fillStyle = palette.line;
	ctx.font = 'bold 22px Inter';
	ctx.fillText(`$${fmtPrice(row.last)}`, priceX, rowInner + 22);

	ctx.font = '13px Inter';
	const arrow = isUp ? '▲' : '▼';
	const sign = isUp ? '+' : '-';
	ctx.fillText(
		`${arrow} ${sign}$${fmt(Math.abs(row.changeAbs))}  (${sign}${Math.abs(row.changePct).toFixed(2)}%)  ·  ${row.rangeLabel}`,
		priceX, rowInner + 42,
	);

	// Column 3: sparkline over the window
	const sparkX = PAD_X + 430;
	const sparkW = W - PAD_X - sparkX - 8;
	drawSparkline(ctx, row, palette, sparkX, rowInner + 4, sparkW, ROW_H - 20);
}

function drawMiniRange(ctx: any, label: string, lo: number, hi: number, cur: number, color: string, x: number, y: number, w: number) {
	const h = 5;
	ctx.fillStyle = COLORS.dim;
	ctx.font = '9px Inter';
	ctx.fillText(label, x, y - 4);
	ctx.fillStyle = COLORS.track;
	ctx.fillRect(x, y, w, h);
	const pos = Math.max(0, Math.min(1, (cur - lo) / (hi - lo))) * w;
	ctx.fillStyle = color;
	ctx.fillRect(x, y, pos, h);
	ctx.fillStyle = '#FFFFFF';
	ctx.fillRect(x + pos - 1.5, y - 2, 3, h + 4);
	ctx.fillStyle = COLORS.dim;
	ctx.font = '10px Inter';
	ctx.fillText(`$${fmtPrice(lo)}`, x, y + 17);
	ctx.textAlign = 'right';
	ctx.fillText(`$${fmtPrice(hi)}`, x + w, y + 17);
	ctx.textAlign = 'left';
}

function drawSparkline(ctx: any, row: WatchlistRow, palette: UpDown, x: number, y: number, w: number, h: number) {
	const series = row.series;
	if (series.length < 2) return;

	ctx.fillStyle = COLORS.panel;
	ctx.fillRect(x, y, w, h);

	const tMin = series[0].t;
	const tMax = series[series.length - 1].t;
	const tSpan = Math.max(1, tMax - tMin);
	const prices = series.map(p => p.price);
	const yMin = Math.min(...prices, row.baseline) - 0.05;
	const yMax = Math.max(...prices, row.baseline) + 0.05;
	const ySpan = Math.max(0.01, yMax - yMin);
	const xS = (t: number) => x + ((t - tMin) / tSpan) * w;
	const yS = (v: number) => y + h - ((v - yMin) / ySpan) * h;

	// Baseline reference (prev close for 1d, window start otherwise)
	ctx.strokeStyle = COLORS.prevLine;
	ctx.setLineDash([3, 3]);
	ctx.beginPath();
	const by = yS(row.baseline);
	ctx.moveTo(x, by);
	ctx.lineTo(x + w, by);
	ctx.stroke();
	ctx.setLineDash([]);

	// Area fill
	ctx.beginPath();
	ctx.moveTo(xS(series[0].t), y + h);
	for (const p of series) ctx.lineTo(xS(p.t), yS(p.price));
	ctx.lineTo(xS(series[series.length - 1].t), y + h);
	ctx.closePath();
	ctx.fillStyle = palette.fill;
	ctx.fill();

	// Line
	ctx.strokeStyle = palette.line;
	ctx.lineWidth = 1.8;
	ctx.beginPath();
	series.forEach((p, i) => {
		const px = xS(p.t), py = yS(p.price);
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	});
	ctx.stroke();

	// End dot
	const last = series[series.length - 1];
	ctx.fillStyle = palette.line;
	ctx.beginPath();
	ctx.arc(xS(last.t), yS(last.price), 3, 0, Math.PI * 2);
	ctx.fill();
}
