import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { BarSeries, fetchYahooBars, PriceData } from '../utils/priceApi';
import { computeLevels, etParts, LEVELS_CONFIG, LineKind, pmPosition, SymbolLevels, vixBand, whereNow } from '../utils/marketLevels';
import { ChartLevel, renderAssetChart } from './asset-chart';
import logger from '../utils/logger';

const UP = 0x26A65B;
const DOWN = 0xE5484D;
const GREY = 0x80848E;

const f2 = (v?: number) => v == null ? '—' : v.toFixed(2);
const pct = (v: number, d = 2) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(d)}%`;
const hl = (h?: number, l?: number) => `${f2(h)} / ${f2(l)}`;

// Lines for one configured symbol. `primary` is the primary symbol's levels, used
// by 'relative' for the divergence note.
export function formatLines(kind: LineKind, label: string, lv: SymbolLevels | null, primary?: SymbolLevels | null): string[] {
	if (!lv) return [`**${label}** unavailable`];
	switch (kind) {
	case 'primary': {
		const where = whereNow(lv);
		const lines = [`**${label} ${f2(lv.last)}** ${pct(lv.changePct)}${where ? ` · ${where}` : ''}`];
		lines.push(`PM ${hl(lv.pmHigh, lv.pmLow)}${lv.orHigh != null ? ` · OR ${hl(lv.orHigh, lv.orLow)}` : ''}`);
		lines.push(`PD ${hl(lv.pdHigh, lv.pdLow)} · C ${f2(lv.prevClose)}`);
		return lines;
	}
	case 'relative': {
		const pos = pmPosition(lv.last, lv.pmHigh, lv.pmLow);
		const diverging = primary && Math.sign(primary.changePct) !== Math.sign(lv.changePct);
		return [`**${label} ${f2(lv.last)}** ${pct(lv.changePct)}${pos ? ` · ${pos}` : ''}${diverging ? ' · ⚠️ diverging' : ''}`];
	}
	case 'vix': {
		const chg = lv.last - lv.prevClose;
		return [`**${label} ${f2(lv.last)}** ${chg >= 0 ? '+' : '-'}${Math.abs(chg).toFixed(2)} · ${vixBand(lv.last)}`];
	}
	case 'overnight':
		return [`**${label} ${f2(lv.last)}** ${lv.overnightPct != null ? `${pct(lv.overnightPct, 1)} overnight` : ''}`.trim()];
	}
}

function stamp(nowSec: number): string {
	const d = new Date(nowSec * 1000);
	const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
	const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
	return `${day}, ${time} ET`;
}

export function levelsUnavailableEmbed(nowSec: number): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(GREY)
		.setTitle(`Market levels · ${stamp(nowSec)}`)
		.setDescription('Levels unavailable — Yahoo didn\'t return data. Try `levels` again in a minute.');
}

// SPY 5m line from 04:00 ET today with level overlays. Null when there are fewer
// than two bars today (e.g. on-demand before the premarket opens).
function renderLevelsChart(label: string, series: BarSeries, lv: SymbolLevels, nowSec: number): Buffer | null {
	const today = etParts(nowSec).date;
	const bars = series.bars.filter(b => b.t <= nowSec && etParts(b.t).date === today && etParts(b.t).minutes >= 4 * 60);
	if (bars.length < 2) return null;
	const window = series.regular_windows.find(w => etParts(w.start).date === today);
	const firstReg = bars.find(b => etParts(b.t).minutes >= 9 * 60 + 30)?.t;
	const regStart = window?.start ?? firstReg ?? bars[bars.length - 1].t + 1;
	const price: PriceData = {
		symbol: label,
		price: lv.last,
		change_pct: lv.changePct,
		high: lv.todayHigh ?? 0,
		low: lv.todayLow ?? 0,
		prev_close: lv.prevClose,
		source: 'yahoo',
		intraday: {
			timestamps: bars.map(b => b.t),
			closes: bars.map(b => b.close),
			regular_start: regStart,
			regular_end: window?.end ?? regStart + 6.5 * 3600,
		},
	};
	const levels: ChartLevel[] = [];
	const add = (lbl: string, value: number | undefined, color: string) => { if (value != null) levels.push({ label: lbl, value, color }); };
	add('PMH', lv.pmHigh, 'rgba(120,170,255,0.75)');
	add('PML', lv.pmLow, 'rgba(120,170,255,0.75)');
	add('ORH', lv.orHigh, 'rgba(255,200,90,0.8)');
	add('ORL', lv.orLow, 'rgba(255,200,90,0.8)');
	add('PDH', lv.pdHigh, 'rgba(200,140,255,0.7)');
	add('PDL', lv.pdLow, 'rgba(200,140,255,0.7)');
	return renderAssetChart(price, 'stock', `${label} · 5m from 04:00 ET`, 'line', levels);
}

export interface LevelsMessage { embeds: EmbedBuilder[]; files: AttachmentBuilder[] }

// The one builder behind both the 09:58 post and the `levels` command. With
// requireToday, returns null when the primary symbol has no regular-session bars
// dated today (closed day the calendar missed) — the watcher skips the post.
export async function buildLevelsMessage(nowSec = Math.floor(Date.now() / 1000), opts: { requireToday?: boolean } = {}): Promise<LevelsMessage | null> {
	const series = await Promise.all(LEVELS_CONFIG.map(c => fetchYahooBars(c.yahoo)));
	const levels = series.map(s => s ? computeLevels(s, nowSec) : null);
	const pIdx = LEVELS_CONFIG.findIndex(c => c.kind === 'primary');
	const primary = pIdx >= 0 ? levels[pIdx] : null;

	if (levels.every(l => !l) || (pIdx >= 0 && !primary)) {
		return { embeds: [levelsUnavailableEmbed(nowSec)], files: [] };
	}
	if (opts.requireToday && primary && !primary.hasToday) return null;

	const lines = LEVELS_CONFIG.flatMap((c, i) => formatLines(c.kind, c.label, levels[i], primary));
	const embed = new EmbedBuilder()
		.setColor(primary ? (primary.changePct >= 0 ? UP : DOWN) : GREY)
		.setTitle(`Market levels · ${stamp(nowSec)}`)
		.setDescription(lines.join('\n'))
		// "tickers … yahoo" matches replyExcerpt's FINANCE_FOOTER_RE, so a reply to
		// this card routes to the finance model.
		.setFooter({ text: `${LEVELS_CONFIG.length} tickers • 5m bars • yahoo` })
		.setTimestamp(nowSec * 1000);

	const files: AttachmentBuilder[] = [];
	if (pIdx >= 0 && primary) {
		try {
			const png = renderLevelsChart(LEVELS_CONFIG[pIdx].label, series[pIdx]!, primary, nowSec);
			if (png) {
				files.push(new AttachmentBuilder(png, { name: 'levels.png' }));
				embed.setImage('attachment://levels.png');
			}
		}
		catch (err) {
			logger.warn('levels chart render failed:', err);
		}
	}
	return { embeds: [embed], files };
}
