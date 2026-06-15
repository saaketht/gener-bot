import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PriceData, AssetType, HistoryData, RANGE_LABELS } from '../utils/priceApi';
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
	return rows;
}

function priceBar(low: number, high: number, current: number, barLen = 12): string {
	const span = high - low;
	const rawPos = span > 0 ? Math.round(((current - low) / span) * (barLen - 1)) : Math.floor(barLen / 2);
	const pos = Math.max(0, Math.min(barLen - 1, rawPos));
	return '░'.repeat(pos) + '█' + '░'.repeat(barLen - 1 - pos);
}
