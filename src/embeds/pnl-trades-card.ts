import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import * as path from 'path';
import { Leg, ThetaBand, fmtHold, thetaBand, thetaBandLabel, typeAbbr } from './pnl-embeds';

// Inter stays registered as a fallback. macOS Helvetica.ttc is the primary —
// it's a TrueType Collection with regular/bold/oblique in one file, so font
// strings like `italic 13px Helvetica` automatically pick the oblique face.
// On the Debian deploy VM Helvetica isn't installed; canvas falls back to
// Inter, which is fine.
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Inter-Regular.ttf'), 'Inter');
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Inter-Bold.ttf'), 'Inter');
try {
	GlobalFonts.registerFromPath('/System/Library/Fonts/Helvetica.ttc', 'Helvetica');
}
catch {
	// Linux deploy — Helvetica not present, font stack will fall back to Inter.
}

const FONT = 'Helvetica, Inter';

// Rendered at 2× for HiDPI clarity. All coords below are in logical px; ctx is
// scaled once at the top of render so downstream code stays readable.
const DPR = 2;
const W = 800;
const CARD_H = 96;
const CARD_GAP = 10;
const CARD_RADIUS = 10;
const OUTER_PAD = 18;
const INNER_PAD_X = 22;
const ACCENT_W = 3;

const COLORS = {
	bg: '#1A1B1E',
	card: '#23252A',
	text: '#F2F3F5',
	dim: '#9BA1A8',
	subtle: '#6E737A',
	win: '#10B981',
	loss: '#EF4444',
	be: '#9BA1A8',
};

const BAND_COLOR: Record<ThetaBand, string> = {
	'low': '#10B981',
	'building': '#F59E0B',
	'heavy': '#F97316',
	'extreme': '#EF4444',
	'': COLORS.dim,
};

function fmt(n: number, d = 0): string {
	return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPlSigned(n: number): string {
	const abs = fmt(Math.abs(n));
	return n < 0 ? `−$${abs}` : `+$${abs}`;
}

function fmtPlNeutral(n: number): string {
	if (n === 0) return '$0';
	return fmtPlSigned(n);
}

function fmtPrice(n: number): string {
	return `$${n.toFixed(2)}`;
}

function fmtHMShort(time: string): string {
	const m = String(time).match(/(\d{1,2}):(\d{2})/);
	return m ? `${m[1].padStart(2, '0')}:${m[2]}` : time;
}

type Outcome = 'WIN' | 'LOSS' | 'BE';

function outcomeOf(leg: Leg): Outcome {
	if (leg.pl > 0) return 'WIN';
	if (leg.pl < 0) return 'LOSS';
	return 'BE';
}

function outcomeColor(o: Outcome): string {
	return o === 'WIN' ? COLORS.win : o === 'LOSS' ? COLORS.loss : COLORS.be;
}

// Meta-line column widths shared across rows so the hold/theta separator dot
// lines up vertically. Measured per-render rather than hardcoded so the column
// adapts to whatever hold-time text the batch contains.
interface MetaCols {
	holdW: number;
}

function measureMetaCols(ctx: any, legs: Leg[]): MetaCols {
	let holdW = 0;
	for (const leg of legs) {
		ctx.font = `italic 13px ${FONT}`;
		const w = ctx.measureText(`${fmtHold(leg.holdMin)} hold`).width;
		if (w > holdW) holdW = w;
	}
	return { holdW };
}

export function renderPnlLegsCard(legs: Leg[]): Buffer | null {
	if (!legs.length) return null;

	const H = OUTER_PAD * 2 + legs.length * CARD_H + (legs.length - 1) * CARD_GAP;
	const canvas = createCanvas(W * DPR, H * DPR);
	const ctx = canvas.getContext('2d');
	ctx.scale(DPR, DPR);

	ctx.fillStyle = COLORS.bg;
	ctx.fillRect(0, 0, W, H);

	const cols = measureMetaCols(ctx, legs);

	for (let i = 0; i < legs.length; i++) {
		const top = OUTER_PAD + i * (CARD_H + CARD_GAP);
		drawCard(ctx, legs[i], top, cols);
	}

	return canvas.toBuffer('image/png');
}

function drawCard(ctx: any, leg: Leg, top: number, cols: MetaCols) {
	const outcome = outcomeOf(leg);
	const color = outcomeColor(outcome);
	const cardLeft = OUTER_PAD;
	const cardRight = W - OUTER_PAD;
	const cardW = cardRight - cardLeft;

	// Card panel
	drawRoundedRect(ctx, cardLeft, top, cardW, CARD_H, CARD_RADIUS);
	ctx.fillStyle = COLORS.card;
	ctx.fill();

	// Left accent strip, clipped to rounded corners
	ctx.save();
	drawRoundedRect(ctx, cardLeft, top, cardW, CARD_H, CARD_RADIUS);
	ctx.clip();
	ctx.fillStyle = color;
	ctx.fillRect(cardLeft, top, ACCENT_W, CARD_H);
	ctx.restore();

	const xLeft = cardLeft + ACCENT_W + INNER_PAD_X;
	const xRight = cardRight - INNER_PAD_X;
	const headerY = top + 34;
	const metaY = top + 70;

	// --- HEADER LINE ---
	// Contract
	ctx.fillStyle = COLORS.text;
	ctx.font = `bold 19px ${FONT}`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	const main = `${leg.strike}${typeAbbr(leg.type)}`;
	ctx.fillText(main, xLeft, headerY);
	const mainW = ctx.measureText(main).width;

	ctx.fillStyle = COLORS.dim;
	ctx.font = `italic 15px ${FONT}`;
	const qtyStr = ` ×${leg.totalOpened}`;
	ctx.fillText(qtyStr, xLeft + mainW + 2, headerY);
	const qtyW = ctx.measureText(qtyStr).width;

	// Adds indicators — vector triangles, color-only (no chip bg)
	let chipsX = xLeft + mainW + qtyW + 14;
	ctx.font = `bold 13px ${FONT}`;
	if (leg.addsDown) chipsX = drawAddBadge(ctx, leg.addsDown, '▼', COLORS.loss, chipsX, headerY);
	if (leg.addsUp) chipsX = drawAddBadge(ctx, leg.addsUp, '▲', COLORS.win, chipsX, headerY);
	if (leg.addsFlat) chipsX = drawAddBadge(ctx, leg.addsFlat, '＋', COLORS.dim, chipsX, headerY);
	void chipsX;

	// Time range + entry/exit prices — centered as a unit, separated by │
	const timeText = `${fmtHMShort(leg.startTime)} → ${fmtHMShort(leg.endTime)}`;
	const priceText = leg.totalOpened > 0
		? `${fmtPrice(leg.avgEntry)} → ${fmtPrice(leg.avgExit)}`
		: '';
	const sepText = '   │   ';

	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';
	ctx.font = `15px ${FONT}`;
	const timeW = ctx.measureText(timeText).width;
	const sepW = priceText ? ctx.measureText(sepText).width : 0;
	const priceW = priceText ? ctx.measureText(priceText).width : 0;
	const totalCenterW = timeW + sepW + priceW;
	let cx = cardLeft + cardW * 0.5 - totalCenterW / 2;

	ctx.fillStyle = COLORS.dim;
	ctx.font = `15px ${FONT}`;
	ctx.fillText(timeText, cx, headerY);
	cx += timeW;
	if (priceText) {
		ctx.fillStyle = COLORS.subtle;
		ctx.fillText(sepText, cx, headerY);
		cx += sepW;
		ctx.fillStyle = COLORS.dim;
		ctx.font = `15px ${FONT}`;
		ctx.fillText(priceText, cx, headerY);
	}

	// Right edge: WIN/LOSS/BE (text only, bold), P/L, pct
	ctx.fillStyle = color;
	ctx.font = `bold 13px ${FONT}`;
	ctx.textAlign = 'right';
	const pillLabel = outcome;
	ctx.fillText(pillLabel, xRight, headerY);
	let rx = xRight - ctx.measureText(pillLabel).width - 16;

	const pnlStr = fmtPlNeutral(leg.pl);
	const pctStr = leg.totalEntryCost > 0
		? `${leg.pl >= 0 ? '+' : ''}${Math.round((leg.pl / leg.totalEntryCost) * 100)}%`
		: '';

	if (pctStr) {
		ctx.fillStyle = color;
		ctx.font = `italic 15px ${FONT}`;
		ctx.textAlign = 'right';
		ctx.fillText(pctStr, rx, headerY);
		rx -= ctx.measureText(pctStr).width + 10;
	}
	ctx.fillStyle = color;
	ctx.font = `bold 19px ${FONT}`;
	ctx.textAlign = 'right';
	ctx.fillText(pnlStr, rx, headerY);

	// --- META LINE ---
	// Columns are anchored at fixed X positions so the separator dots line up
	// vertically across rows regardless of varying hold/theta text widths.
	ctx.textAlign = 'left';
	const ICON_W = 16;
	const COL_GAP = 14;
	const xClock = xLeft;
	const xHold = xClock + ICON_W;
	const xSep1 = xHold + cols.holdW + COL_GAP;
	const xTheta = xSep1 + COL_GAP;

	drawClockIcon(ctx, xClock + 6, metaY - 7, 6, COLORS.subtle);

	ctx.fillStyle = COLORS.dim;
	ctx.font = `italic 13px ${FONT}`;
	ctx.fillText(`${fmtHold(leg.holdMin)} hold`, xHold, metaY);

	drawSep(ctx, xSep1, metaY);

	// Theta band tokens — non-italic color text, no chip
	const entryBand = thetaBand(leg.entryHour);
	const exitBand = thetaBand(leg.exitHour);
	const sameBand = entryBand === exitBand;
	if (entryBand) {
		let tx = drawBandText(ctx, entryBand, thetaBandLabel(leg.entryHour), xTheta, metaY);
		if (!sameBand && exitBand) {
			// Equal padding on both sides of the arrow. drawBandText already
			// added 10px trailing, so place arrow directly at tx and add 10px
			// before the exit band.
			ctx.fillStyle = COLORS.subtle;
			ctx.font = `13px ${FONT}`;
			ctx.fillText('→', tx, metaY);
			tx += ctx.measureText('→').width + 10;
			drawBandText(ctx, exitBand, thetaBandLabel(leg.exitHour), tx, metaY);
		}
	}

	// Cumulative — right-aligned, label italic dim + value italic colored
	if (leg.cumulativePnl !== 0 || leg.pl !== 0) {
		const cumColor = leg.cumulativePnl < 0 ? COLORS.loss : COLORS.dim;
		const cumValueText = fmtPlNeutral(leg.cumulativePnl);

		ctx.fillStyle = cumColor;
		ctx.font = `italic 13px ${FONT}`;
		ctx.textAlign = 'right';
		ctx.fillText(cumValueText, xRight, metaY);
		const valueW = ctx.measureText(cumValueText).width;

		ctx.fillStyle = COLORS.subtle;
		ctx.font = `italic 13px ${FONT}`;
		ctx.fillText('cumulative ', xRight - valueW - 2, metaY);
	}
}

function drawSep(ctx: any, x: number, y: number): number {
	ctx.fillStyle = COLORS.subtle;
	ctx.font = `13px ${FONT}`;
	ctx.textAlign = 'left';
	ctx.fillText('·', x, y);
	return x + 14;
}

function drawClockIcon(ctx: any, cx: number, cy: number, r: number, color: string) {
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.4;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(cx, cy);
	ctx.lineTo(cx, cy - r * 0.6);
	ctx.moveTo(cx, cy);
	ctx.lineTo(cx + r * 0.55, cy);
	ctx.stroke();
	ctx.restore();
}

function drawAddBadge(ctx: any, count: number, glyph: string, color: string, x: number, y: number): number {
	ctx.fillStyle = color;
	ctx.font = `bold 13px ${FONT}`;
	ctx.textAlign = 'left';
	const text = `${count}${glyph}`;
	ctx.fillText(text, x, y);
	return x + ctx.measureText(text).width + 10;
}

function drawBandText(ctx: any, band: ThetaBand, label: string, x: number, y: number): number {
	ctx.fillStyle = BAND_COLOR[band];
	ctx.font = `13px ${FONT}`;
	ctx.textAlign = 'left';
	ctx.fillText(label, x, y);
	return x + ctx.measureText(label).width + 10;
}

function drawRoundedRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}
