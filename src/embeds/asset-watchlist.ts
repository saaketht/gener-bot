import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import * as path from 'path';
import { PriceData, AssetType } from '../utils/priceApi';

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

export interface WatchlistItem {
	price: PriceData;
	type: AssetType;
	displayName?: string;
}

function fmt(v: number, d = 2): string {
	return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPrice(v: number): string {
	return v >= 1 ? fmt(v, 2) : v.toFixed(4);
}

interface Point { t: number; price: number }

function cleanSeries(price: PriceData): Point[] {
	const intraday = price.intraday;
	if (!intraday) return [];
	const pts: Point[] = [];
	for (let i = 0; i < intraday.timestamps.length; i++) {
		const c = intraday.closes[i];
		if (c == null) continue;
		pts.push({ t: intraday.timestamps[i], price: c });
	}
	return pts;
}

export function renderWatchlistCard(items: WatchlistItem[]): Buffer | null {
	if (items.length < 2) return null;

	const H = PAD_Y * 2 + items.length * ROW_H;
	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext('2d');

	ctx.fillStyle = COLORS.bg;
	ctx.fillRect(0, 0, W, H);

	for (let i = 0; i < items.length; i++) {
		drawRow(ctx, items[i], PAD_Y + i * ROW_H, i);
		if (i < items.length - 1) {
			ctx.fillStyle = COLORS.divider;
			ctx.fillRect(PAD_X, PAD_Y + (i + 1) * ROW_H - 1, W - 2 * PAD_X, 1);
		}
	}

	return canvas.toBuffer('image/png');
}

function drawRow(ctx: any, item: WatchlistItem, top: number, idx: number) {
	const { price, type, displayName } = item;
	const isUp = price.change_pct >= 0;
	const palette = TYPE_PALETTE[type][isUp ? 'up' : 'down'];
	const change = price.price - price.prev_close;

	if (idx % 2 === 1) {
		ctx.fillStyle = COLORS.rowAlt;
		ctx.fillRect(PAD_X, top, W - 2 * PAD_X, ROW_H);
	}

	const rowInner = top + 8;

	// Column 1: ticker + company name
	ctx.fillStyle = COLORS.text;
	ctx.font = 'bold 22px Inter';
	ctx.fillText(price.symbol, PAD_X + 8, rowInner + 22);

	const name = displayName ?? price.name;
	if (name) {
		ctx.fillStyle = COLORS.dim;
		ctx.font = '12px Inter';
		const truncated = name.length > 28 ? name.slice(0, 26) + '…' : name;
		ctx.fillText(truncated, PAD_X + 8, rowInner + 42);
	}

	// Day range mini-bar (col 1, bottom row)
	if (price.high > price.low) {
		drawMiniRange(ctx, 'DAY', price.low, price.high, price.price, palette.line, PAD_X + 8, rowInner + 60, 160);
	}

	// 52-week range mini-bar (col 2, bottom row, under price/change)
	if (price.week52_high && price.week52_low && price.week52_high > price.week52_low) {
		drawMiniRange(ctx, '52W', price.week52_low, price.week52_high, price.price, palette.line, PAD_X + 230, rowInner + 60, 160);
	}

	// Column 2: price + change
	const priceX = PAD_X + 230;
	ctx.fillStyle = palette.line;
	ctx.font = 'bold 22px Inter';
	ctx.fillText(`$${fmtPrice(price.price)}`, priceX, rowInner + 22);

	ctx.font = '13px Inter';
	const arrow = isUp ? '▲' : '▼';
	const sign = isUp ? '+' : '-';
	ctx.fillText(
		`${arrow} ${sign}$${fmt(Math.abs(change))}  (${sign}${Math.abs(price.change_pct).toFixed(2)}%)`,
		priceX, rowInner + 42,
	);

	// Column 3: sparkline
	const sparkX = PAD_X + 430;
	const sparkW = W - PAD_X - sparkX - 8;
	const sparkY = rowInner + 4;
	const sparkH = ROW_H - 20;
	drawSparkline(ctx, price, palette, sparkX, sparkY, sparkW, sparkH);
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

function drawSparkline(ctx: any, price: PriceData, palette: UpDown, x: number, y: number, w: number, h: number) {
	const series = cleanSeries(price);
	if (series.length < 2) return;

	ctx.fillStyle = COLORS.panel;
	ctx.fillRect(x, y, w, h);

	const tMin = series[0].t;
	const tMax = series[series.length - 1].t;
	const tSpan = Math.max(1, tMax - tMin);
	const prices = series.map(p => p.price);
	const yMin = Math.min(...prices, price.prev_close) - 0.05;
	const yMax = Math.max(...prices, price.prev_close) + 0.05;
	const ySpan = Math.max(0.01, yMax - yMin);
	const xS = (t: number) => x + ((t - tMin) / tSpan) * w;
	const yS = (v: number) => y + h - ((v - yMin) / ySpan) * h;

	// Prev close reference
	ctx.strokeStyle = COLORS.prevLine;
	ctx.setLineDash([3, 3]);
	ctx.beginPath();
	const py = yS(price.prev_close);
	ctx.moveTo(x, py);
	ctx.lineTo(x + w, py);
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
	for (let i = 0; i < series.length; i++) {
		const px = xS(series[i].t);
		const pyy = yS(series[i].price);
		if (i === 0) ctx.moveTo(px, pyy);
		else ctx.lineTo(px, pyy);
	}
	ctx.stroke();

	// End dot
	const last = series[series.length - 1];
	ctx.fillStyle = palette.line;
	ctx.beginPath();
	ctx.arc(xS(last.t), yS(last.price), 3, 0, Math.PI * 2);
	ctx.fill();
}
