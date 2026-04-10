import { EmbedBuilder } from 'discord.js';
import { PriceData, AssetType } from '../utils/priceApi';

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

export function getAssetEmbed(price: PriceData, type: AssetType, displayName?: string): EmbedBuilder {
	const isUp = price.change_pct >= 0;
	const arrow = isUp ? '🟢 ▲' : '🔴 ▼';
	const sign = isUp ? '+' : '';
	const color = isUp ? TYPE_COLORS[type].up : TYPE_COLORS[type].down;
	const range = price.high - price.low;
	const change = price.price - price.prev_close;

	// Price position bar helper
	const barLen = 12;
	function priceBar(low: number, high: number, current: number): string {
		const span = high - low;
		const rawPos = span > 0 ? Math.round(((current - low) / span) * (barLen - 1)) : Math.floor(barLen / 2);
		const pos = Math.max(0, Math.min(barLen - 1, rawPos));
		return '░'.repeat(pos) + '█' + '░'.repeat(barLen - 1 - pos);
	}

	const titleName = displayName ? `${displayName} (${price.symbol})` : price.symbol;

	const yahooSymbol = price.query_symbol ?? price.symbol;
	const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}`;

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(`${titleName}  ${arrow} $${fmtPrice(price.price)}`)
		.setURL(yahooUrl)
		.setDescription(
			`${isUp ? '🟢' : '🔴'} ${sign}$${fmtPrice(Math.abs(change))} (${sign}${price.change_pct.toFixed(2)}%) from prev close`,
		)
		.addFields(
			{ name: 'Prev Close', value: `$${fmtPrice(price.prev_close)}`, inline: true },
			{ name: 'High', value: `$${fmtPrice(price.high)}`, inline: true },
			{ name: 'Low', value: `$${fmtPrice(price.low)}`, inline: true },
		);

	if (range > 0) {
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
			{ name: '\u200b', value: '\u200b', inline: true },
		);
		const w52range = price.week52_high - price.week52_low;
		if (w52range > 0) {
			embed.addFields({
				name: `52wk  $${fmtPrice(price.week52_low)}  →  $${fmtPrice(price.week52_high)}`,
				value: `\`${priceBar(price.week52_low, price.week52_high, price.price)}\``,
				inline: false,
			});
		}
	}

	embed.setFooter({ text: `${type}  •  ${price.source}` }).setTimestamp();
	return embed;
}
