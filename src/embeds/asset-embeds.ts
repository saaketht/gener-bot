import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PriceData, AssetType, HistoryData, RANGE_LABELS, toAssetType, getAssetPrice, getHistory } from '../utils/priceApi';
import { renderAssetChart, renderHistoryChart } from './asset-chart';

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

export function getAssetEmbed(price: PriceData, type: AssetType, displayName?: string): AssetEmbedResult {
	const isUp = price.change_pct >= 0;
	const arrow = isUp ? '🟢 ▲' : '🔴 ▼';
	const sign = isUp ? '+' : '';
	const color = isUp ? TYPE_COLORS[type].up : TYPE_COLORS[type].down;
	const change = price.price - price.prev_close;

	const name = displayName ?? price.name;
	const titleName = name ? `${name} (${price.symbol})` : price.symbol;
	const yahooSymbol = price.query_symbol ?? price.symbol;
	const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}`;

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(`${titleName}  ${arrow} $${fmtPrice(price.price)}`)
		.setURL(yahooUrl)
		.setDescription(
			`${isUp ? '🟢' : '🔴'} ${sign}$${fmtPrice(Math.abs(change))} (${sign}${price.change_pct.toFixed(2)}%) from prev close`,
		);

	const files: AttachmentBuilder[] = [];
	const chart = renderAssetChart(price, type, name);
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

export function getHistoryEmbed(data: HistoryData, type: AssetType, displayName?: string): AssetEmbedResult {
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
	const chart = renderHistoryChart(data, type, name);
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
): Promise<AssetEmbedResult | null> {
	if (range === '1d') {
		const price = await getAssetPrice(symbol, type, force);
		return price ? getAssetEmbed(price, type) : null;
	}
	const hist = await getHistory(symbol, range, type, force);
	return hist ? getHistoryEmbed(hist, type) : null;
}

// Decode a timeframe / refresh button customId back into its parts. range and
// type never contain underscores, so two leading splits isolate the symbol
// intact even if the symbol itself does (e.g. NATURAL_GAS).
export function parseTimeframeCustomId(customId: string): { range: string; type: AssetType; symbol: string } | null {
	const prefix = customId.startsWith('asset_tf_') ? 'asset_tf_'
		: customId.startsWith('asset_refresh_') ? 'asset_refresh_'
			: null;
	if (!prefix) return null;
	const rest = customId.slice(prefix.length);
	const i1 = rest.indexOf('_');
	if (i1 < 0) return null;
	const range = rest.slice(0, i1);
	const rest2 = rest.slice(i1 + 1);
	const i2 = rest2.indexOf('_');
	if (i2 < 0) return null;
	const symbol = rest2.slice(i2 + 1);
	if (!range || !symbol) return null;
	return { range, type: toAssetType(rest2.slice(0, i2)), symbol };
}

export function buildTimeframeRows(displaySymbol: string, type: AssetType, active: string): ActionRowBuilder<ButtonBuilder>[] {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let i = 0; i < TIMEFRAME_ORDER.length; i += 4) {
		const row = new ActionRowBuilder<ButtonBuilder>();
		for (const range of TIMEFRAME_ORDER.slice(i, i + 4)) {
			const isActive = range === active;
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`asset_tf_${range}_${type}_${displaySymbol}`)
					.setLabel(RANGE_LABELS[range])
					.setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Secondary)
					.setDisabled(isActive),
			);
		}
		rows.push(row);
	}
	// Refresh re-fetches the active timeframe with fresh data (cache bypassed).
	// Encodes the active range so the handler knows what to re-pull. Rides on the
	// last row's spare slot (4 timeframes + refresh = 5, Discord's row max).
	rows[rows.length - 1].addComponents(
		new ButtonBuilder()
			.setCustomId(`asset_refresh_${active}_${type}_${displaySymbol}`)
			.setEmoji('🔄')
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
