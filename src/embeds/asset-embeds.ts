import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PriceData, AssetType, HistoryData, RANGE_LABELS, toAssetType, getAssetPrice, getHistory } from '../utils/priceApi';
import { renderAssetChart, renderHistoryChart, candleAllowed, ChartMode } from './asset-chart';

function fmt(val: number, decimals = 2): string {
	return val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPrice(val: number): string {
	if (val >= 1) return fmt(val, 2);
	return val.toFixed(4);
}

const TYPE_COLORS: Record<AssetType, { up: number; down: number }> = {
	stock: { up: 0x10B981, down: 0xEF4444 },
	crypto: { up: 0xF7931A, down: 0xF7931A },
	commodity: { up: 0x1E3A5F, down: 0x1E3A5F },
};

export interface AssetEmbedResult {
	embed: EmbedBuilder;
	files: AttachmentBuilder[];
}

let chartCounter = 0;

export function getAssetEmbed(price: PriceData, type: AssetType, displayName?: string, mode: ChartMode = 'line'): AssetEmbedResult {
	// During an active extended session the headline price moves against the last
	// regular close, not prev close — keep the dollar change and label in step with
	// change_pct (which priceApi computes the same way).
	const extLabel = price.session === 'pre' ? 'pre-market'
		: price.session === 'post' ? 'after hours'
			: null;
	const baseline = extLabel && price.regular_close != null ? price.regular_close : price.prev_close;
	const isUp = price.change_pct >= 0;
	const arrow = isUp ? '🟢 ▲' : '🔴 ▼';
	const sign = isUp ? '+' : '';
	const color = isUp ? TYPE_COLORS[type].up : TYPE_COLORS[type].down;
	const change = price.price - baseline;

	const name = displayName ?? price.name;
	const titleName = name ? `${name} (${price.symbol})` : price.symbol;
	const yahooSymbol = price.query_symbol ?? price.symbol;
	const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}`;

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(`${titleName}  ${arrow} $${fmtPrice(price.price)}`)
		.setURL(yahooUrl)
		.setDescription(
			`${isUp ? '🟢' : '🔴'} ${sign}$${fmtPrice(Math.abs(change))} (${sign}${price.change_pct.toFixed(2)}%) ${extLabel ?? 'from prev close'}`,
		);

	const files: AttachmentBuilder[] = [];
	const chart = renderAssetChart(price, type, name, mode);
	if (chart) {
		const filename = `chart-${++chartCounter}.png`;
		files.push(new AttachmentBuilder(chart, { name: filename }));
		embed.setImage(`attachment://${filename}`);
	}
	else {
		// No intraday data — render the legacy text-only field grid so the embed
		// still carries the essentials.
		embed.addFields(
			{ name: 'Prev Close', value: `$${fmtPrice(price.prev_close)}`, inline: true },
			{ name: 'High', value: `$${fmtPrice(price.high)}`, inline: true },
			{ name: 'Low', value: `$${fmtPrice(price.low)}`, inline: true },
		);
		if (price.high > price.low) {
			embed.addFields({
				name: `L $${fmtPrice(price.low)}  →  H $${fmtPrice(price.high)}`,
				value: `\`${priceBar(price.low, price.high, price.price)}\``,
				inline: false,
			});
		}
		if (price.week52_high && price.week52_low) {
			embed.addFields(
				{ name: '52wk Low', value: `$${fmtPrice(price.week52_low)}`, inline: true },
				{ name: '52wk High', value: `$${fmtPrice(price.week52_high)}`, inline: true },
				{ name: '​', value: '​', inline: true },
			);
			if (price.week52_high > price.week52_low) {
				embed.addFields({
					name: `52wk  $${fmtPrice(price.week52_low)}  →  $${fmtPrice(price.week52_high)}`,
					value: `\`${priceBar(price.week52_low, price.week52_high, price.price)}\``,
					inline: false,
				});
			}
		}
	}

	embed.setFooter({ text: `${type}  •  ${price.source}` }).setTimestamp();
	return { embed, files };
}

export function getHistoryEmbed(data: HistoryData, type: AssetType, displayName?: string, mode: ChartMode = 'line'): AssetEmbedResult {
	const first = data.points[0].price;
	const last = data.points[data.points.length - 1].price;
	const change = last - first;
	const pct = first !== 0 ? (change / first) * 100 : 0;
	const isUp = change >= 0;
	const arrow = isUp ? '🟢 ▲' : '🔴 ▼';
	const sign = isUp ? '+' : '';
	const color = isUp ? TYPE_COLORS[type].up : TYPE_COLORS[type].down;
	const label = RANGE_LABELS[data.range] ?? data.range.toUpperCase();

	const name = displayName ?? data.name;
	const titleName = name ? `${name} (${data.symbol})` : data.symbol;
	const yahooSymbol = data.query_symbol ?? data.symbol;
	const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}`;

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(`${titleName}  ${arrow} $${fmtPrice(last)}`)
		.setURL(yahooUrl)
		.setDescription(
			`${isUp ? '🟢' : '🔴'} ${sign}$${fmtPrice(Math.abs(change))} (${sign}${pct.toFixed(2)}%) over ${label}`,
		);

	const files: AttachmentBuilder[] = [];
	const chart = renderHistoryChart(data, type, name, mode);
	if (chart) {
		const filename = `chart-${++chartCounter}.png`;
		files.push(new AttachmentBuilder(chart, { name: filename }));
		embed.setImage(`attachment://${filename}`);
	}

	embed.setFooter({ text: `${type}  •  ${label}  •  ${data.source}` }).setTimestamp();
	return { embed, files };
}

// Two rows of four. The active timeframe is highlighted and disabled so it can't
// be re-clicked. Encodes the friendly display symbol (not the Yahoo form) so the
// handler can re-normalize per type and keep the displayed ticker stable.
const TIMEFRAME_ORDER = ['1d', '1w', '1m', '3m', 'ytd', '1y', '5y', 'all'];

// Fetch + build the embed for a timeframe view. 1d uses the live intraday quote;
// other ranges use historical candles. force bypasses caches (the refresh button).
// Returns null when the fetch yields nothing, leaving the Discord-facing handler
// to decide how to surface that. Kept free of interaction objects so it's testable.
export async function resolveAssetView(
	symbol: string,
	type: AssetType,
	range: string,
	force = false,
	mode: ChartMode = 'line',
): Promise<AssetEmbedResult | null> {
	if (range === '1d') {
		const price = await getAssetPrice(symbol, type, force);
		return price ? getAssetEmbed(price, type, undefined, mode) : null;
	}
	const hist = await getHistory(symbol, range, type, force);
	return hist ? getHistoryEmbed(hist, type, undefined, mode) : null;
}

// Decode a timeframe / refresh / mode-toggle customId into its parts. An optional
// leading mode segment (line|candle) is sniffed off first — legacy 4-segment
// buttons on old messages omit it and default to line. range and type never
// contain underscores, so the symbol (which may, e.g. NATURAL_GAS) stays intact.
export function parseTimeframeCustomId(customId: string): { mode: ChartMode; range: string; type: AssetType; symbol: string } | null {
	const prefix = customId.startsWith('asset_tf_') ? 'asset_tf_'
		: customId.startsWith('asset_refresh_') ? 'asset_refresh_'
			: customId.startsWith('asset_mode_') ? 'asset_mode_'
				: null;
	if (!prefix) return null;
	let rest = customId.slice(prefix.length);

	let mode: ChartMode = 'line';
	const i0 = rest.indexOf('_');
	const seg0 = i0 >= 0 ? rest.slice(0, i0) : '';
	if (seg0 === 'line' || seg0 === 'candle') {
		mode = seg0;
		rest = rest.slice(i0 + 1);
	}

	const i1 = rest.indexOf('_');
	if (i1 < 0) return null;
	const range = rest.slice(0, i1);
	const rest2 = rest.slice(i1 + 1);
	const i2 = rest2.indexOf('_');
	if (i2 < 0) return null;
	const symbol = rest2.slice(i2 + 1);
	if (!range || !symbol) return null;
	return { mode, range, type: toAssetType(rest2.slice(0, i2)), symbol };
}

// 8 timeframes + refresh + candle-toggle = 10 buttons across two rows of five
// (Discord's per-row max). customIds carry the active chart mode so it sticks as
// the user switches timeframes; the symbol is the friendly display form so the
// handler re-normalizes per type and the ticker stays stable.
export function buildTimeframeRows(displaySymbol: string, type: AssetType, active: string, mode: ChartMode = 'line'): ActionRowBuilder<ButtonBuilder>[] {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let i = 0; i < TIMEFRAME_ORDER.length; i += 5) {
		const row = new ActionRowBuilder<ButtonBuilder>();
		for (const range of TIMEFRAME_ORDER.slice(i, i + 5)) {
			const isActive = range === active;
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`asset_tf_${mode}_${range}_${type}_${displaySymbol}`)
					.setLabel(RANGE_LABELS[range])
					.setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Secondary)
					.setDisabled(isActive),
			);
		}
		rows.push(row);
	}
	const lastRow = rows[rows.length - 1];
	// Refresh re-fetches the active timeframe with fresh data (cache bypassed).
	lastRow.addComponents(
		new ButtonBuilder()
			.setCustomId(`asset_refresh_${mode}_${active}_${type}_${displaySymbol}`)
			.setEmoji('🔄')
			.setStyle(ButtonStyle.Secondary),
	);
	// Candle/line toggle — flips to the opposite mode. Disabled on ranges too dense
	// for candles (1y/5y/all), which always render as a line.
	const target: ChartMode = mode === 'candle' ? 'line' : 'candle';
	lastRow.addComponents(
		new ButtonBuilder()
			.setCustomId(`asset_mode_${target}_${active}_${type}_${displaySymbol}`)
			.setEmoji(target === 'candle' ? '🕯️' : '📈')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(!candleAllowed(active)),
	);
	return rows;
}

export type WatchlistView = 'rows' | 'overlay';

// Decode a watchlist button customId. tf/refresh/view all encode <view>_<range>
// (view = the mode to render); force is set only by refresh (cache bypass).
export function parseWatchlistCustomId(customId: string): { view: WatchlistView; range: string; force: boolean } | null {
	const isTf = customId.startsWith('watchlist_tf_');
	const isRefresh = customId.startsWith('watchlist_refresh_');
	const isView = customId.startsWith('watchlist_view_');
	if (!isTf && !isRefresh && !isView) return null;
	const prefix = isTf ? 'watchlist_tf_' : isRefresh ? 'watchlist_refresh_' : 'watchlist_view_';
	const rest = customId.slice(prefix.length);
	const i = rest.indexOf('_');
	if (i < 0) return null;
	const range = rest.slice(i + 1);
	if (!range) return null;
	return { view: rest.slice(0, i) === 'overlay' ? 'overlay' : 'rows', range, force: isRefresh };
}

// Timeframe + refresh + view-toggle buttons for the multi-ticker watchlist. No
// symbols in the customId (would blow the 100-char cap) — the handler re-parses
// the original message text instead. customIds carry the active view (rows card
// vs normalized overlay) so it sticks across timeframe switches.
export function buildWatchlistButtons(active: string, view: WatchlistView = 'rows'): ActionRowBuilder<ButtonBuilder>[] {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let i = 0; i < TIMEFRAME_ORDER.length; i += 5) {
		const row = new ActionRowBuilder<ButtonBuilder>();
		for (const range of TIMEFRAME_ORDER.slice(i, i + 5)) {
			const isActive = range === active;
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`watchlist_tf_${view}_${range}`)
					.setLabel(RANGE_LABELS[range])
					.setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Secondary)
					.setDisabled(isActive),
			);
		}
		rows.push(row);
	}
	const lastRow = rows[rows.length - 1];
	lastRow.addComponents(
		new ButtonBuilder()
			.setCustomId(`watchlist_refresh_${view}_${active}`)
			.setEmoji('🔄')
			.setStyle(ButtonStyle.Secondary),
	);
	// Toggle between the rows card and the normalized % overlay.
	const targetView = view === 'overlay' ? 'rows' : 'overlay';
	lastRow.addComponents(
		new ButtonBuilder()
			.setCustomId(`watchlist_view_${targetView}_${active}`)
			.setEmoji(targetView === 'overlay' ? '📈' : '📋')
			.setStyle(ButtonStyle.Secondary),
	);
	return rows;
}

function priceBar(low: number, high: number, current: number, barLen = 12): string {
	const span = high - low;
	const rawPos = span > 0 ? Math.round(((current - low) / span) * (barLen - 1)) : Math.floor(barLen / 2);
	const pos = Math.max(0, Math.min(barLen - 1, rawPos));
	return '░'.repeat(pos) + '█' + '░'.repeat(barLen - 1 - pos);
}
