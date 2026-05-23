import { createCanvas } from '@napi-rs/canvas';
import { PriceData, AssetType, IntradaySeries, Session } from '../utils/priceApi';

const W = 800;
const H = 360;

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

interface CleanedPoint {
	t: number;
	price: number;
}

function cleanSeries(intraday: IntradaySeries): CleanedPoint[] {
	const pts: CleanedPoint[] = [];
	for (let i = 0; i < intraday.timestamps.length; i++) {
		const c = intraday.closes[i];
		if (c == null) continue;
		pts.push({ t: intraday.timestamps[i], price: c });
	}
	return pts;
}

export function renderAssetChart(price: PriceData, type: AssetType, displayName?: string): Buffer | null {
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
		ctx.font = '13px sans-serif';
		ctx.fillText(company.toUpperCase(), 28, 30);
	}

	ctx.fillStyle = COLORS.text;
	ctx.font = 'bold 34px sans-serif';
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
		ctx.font = 'bold 12px sans-serif';
		ctx.fillText(sessionLabel, tagX + (38 - ctx.measureText(sessionLabel).width) / 2, 56);
	}

	// Headline change uses regular session vs prev close so the percent is stable
	// across extended hours (the price tag tells you what session is live).
	const headlineRef = price.regular_close ?? price.price;
	const regChange = headlineRef - price.prev_close;
	const regPct = (regChange / price.prev_close) * 100;
	const regArrow = regChange >= 0 ? '▲' : '▼';
	const regSign = regChange >= 0 ? '+' : '-';
	ctx.fillStyle = regChange >= 0 ? palette.line : TYPE_PALETTE[type].down.line;
	ctx.font = '18px sans-serif';
	ctx.fillText(
		`${regArrow} ${regSign}$${fmt(Math.abs(regChange))}  (${regSign}${Math.abs(regPct).toFixed(2)}%)`,
		28, 92,
	);

	const extPrice = price.session === 'post' ? price.post_market_price
		: price.session === 'pre' ? price.pre_market_price
			: undefined;
	if (extPrice && price.regular_close) {
		const extChange = extPrice - price.regular_close;
		const extPct = (extChange / price.regular_close) * 100;
		const extSign = extChange >= 0 ? '+' : '-';
		const label = price.session === 'post' ? 'after hours' : 'pre-market';
		ctx.fillStyle = COLORS.dim;
		ctx.font = '13px sans-serif';
		ctx.fillText(
			`${label}  ${extSign}$${fmt(Math.abs(extChange))} (${extSign}${Math.abs(extPct).toFixed(2)}%)`,
			28, 112,
		);
	}

	// Right-side stat grid: up to 4 cells in a 2x2 layout
	const stats: Array<{ label: string; value: string }> = [
		{ label: 'PREV CLOSE', value: `$${fmtPrice(price.prev_close)}` },
	];
	if (price.open) stats.push({ label: 'OPEN', value: `$${fmtPrice(price.open)}` });
	if (price.volume) stats.push({ label: 'VOLUME', value: fmtCompact(price.volume) });
	if (price.market_cap) stats.push({ label: 'MKT CAP', value: `$${fmtCompact(price.market_cap)}` });
	if (price.pe_ratio) stats.push({ label: 'P/E', value: price.pe_ratio.toFixed(1) });

	// 2x2 right-anchored grid. Fill order: top-right, top-left, bot-right, bot-left
	// so the most important stat (prev close) lands in the eye's first position.
	const colW = 110;
	const rowY = [50, 88];
	ctx.textAlign = 'right';
	for (let i = 0; i < Math.min(stats.length, 4); i++) {
		const row = i < 2 ? 0 : 1;
		const col = i % 2;
		const x = W - 28 - col * colW;
		ctx.fillStyle = COLORS.dim;
		ctx.font = '12px sans-serif';
		ctx.fillText(stats[i].label, x, rowY[row]);
		ctx.fillStyle = COLORS.text;
		ctx.font = '15px sans-serif';
		ctx.fillText(stats[i].value, x, rowY[row] + 19);
	}
	ctx.textAlign = 'left';

	// Chart panel
	const chartX = 28, chartY = 130, chartW = W - 56, chartH = 170;
	ctx.fillStyle = COLORS.panel;
	ctx.fillRect(chartX, chartY, chartW, chartH);

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
	ctx.font = '11px sans-serif';
	ctx.fillText(`prev $${fmtPrice(price.prev_close)}`, chartX + 6, py - 4);

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

	// Day & 52wk range tracks
	function drawRangeBar(label: string, lo: number, hi: number, cur: number, y: number) {
		ctx.fillStyle = COLORS.dim;
		ctx.font = '12px sans-serif';
		ctx.fillText(label, chartX, y - 6);
		ctx.textAlign = 'right';
		ctx.fillText(`$${fmtPrice(lo)}  —  $${fmtPrice(hi)}`, chartX + chartW, y - 6);
		ctx.textAlign = 'left';
		const trackH = 6;
		ctx.fillStyle = '#3A3C42';
		ctx.fillRect(chartX, y, chartW, trackH);
		const ratio = Math.max(0, Math.min(1, (cur - lo) / Math.max(0.0001, hi - lo)));
		const pos = ratio * chartW;
		ctx.fillStyle = palette.line;
		ctx.fillRect(chartX, y, pos, trackH);
		ctx.fillStyle = '#FFFFFF';
		ctx.fillRect(chartX + pos - 1.5, y - 2, 3, trackH + 4);
	}

	const barY = chartY + chartH + 28;
	if (price.low > 0 && price.high > price.low) {
		drawRangeBar(
			`DAY  L $${fmtPrice(price.low)} → H $${fmtPrice(price.high)}`,
			price.low, price.high, price.regular_close ?? price.price, barY,
		);
	}
	if (price.week52_low && price.week52_high && price.week52_high > price.week52_low) {
		drawRangeBar(
			`52WK  $${fmtPrice(price.week52_low)} → $${fmtPrice(price.week52_high)}`,
			price.week52_low, price.week52_high, price.price, barY + 38,
		);
	}

	return canvas.toBuffer('image/png');
}

function sessionTag(session: Session | undefined): string | null {
	if (session === 'pre') return 'PRE';
	if (session === 'post') return 'AH';
	return null;
}
