import { EmbedBuilder } from 'discord.js';

interface GlobalQuote {
	'01. symbol': string;
	'02. open': string;
	'03. high': string;
	'04. low': string;
	'05. price': string;
	'06. volume': string;
	'07. latest trading day': string;
	'08. previous close': string;
	'09. change': string;
	'10. change percent': string;
}

function fmt(val: string, decimals = 2): string {
	return parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtVolume(val: string): string {
	const n = parseInt(val);
	if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
	return n.toString();
}

export function getStockQuoteEmbed(quote: GlobalQuote): EmbedBuilder {
	const price = parseFloat(quote['05. price']);
	const change = parseFloat(quote['09. change']);
	const changePct = parseFloat(quote['10. change percent']?.replace('%', ''));
	const isUp = change >= 0;
	const arrow = isUp ? '🟢 ▲' : '🔴 ▼';
	const sign = isUp ? '+' : '';
	const color = isUp ? 0x10B981 : 0xEF4444;
	const high = parseFloat(quote['03. high']);
	const low = parseFloat(quote['04. low']);
	const range = high - low;

	// Price position within day's range (for the bar)
	const barLen = 12;
	const rawPos = range > 0 ? Math.round(((price - low) / range) * (barLen - 1)) : Math.floor(barLen / 2);
	const pos = Math.max(0, Math.min(barLen - 1, rawPos));
	const bar = '░'.repeat(pos) + '█' + '░'.repeat(barLen - 1 - pos);

	return new EmbedBuilder()
		.setColor(color)
		.setTitle(`${quote['01. symbol']}  ${arrow} $${fmt(quote['05. price'])}`)
		.setDescription(
			`${isUp ? '🟢' : '🔴'} ${sign}$${fmt(quote['09. change'])} (${sign}${changePct.toFixed(2)}%) from prev close`,
		)
		.addFields(
			{ name: 'Open', value: `$${fmt(quote['02. open'])}`, inline: true },
			{ name: 'Prev Close', value: `$${fmt(quote['08. previous close'])}`, inline: true },
			{ name: 'Volume', value: fmtVolume(quote['06. volume']), inline: true },
			{ name: 'High', value: `$${fmt(quote['03. high'])}`, inline: true },
			{ name: 'Low', value: `$${fmt(quote['04. low'])}`, inline: true },
			{ name: 'Range', value: `$${fmt(String(range))}`, inline: true },
			{ name: `L $${fmt(quote['04. low'])}  →  H $${fmt(quote['03. high'])}`, value: `\`${bar}\``, inline: false },
		)
		.setFooter({ text: `${quote['07. latest trading day']}  •  Alpha Vantage` })
		.setTimestamp();
}

interface CurrencyExchangeRate {
	'1. From_Currency Code': string;
	'2. From_Currency Name': string;
	'3. To_Currency Code': string;
	'4. To_Currency Name': string;
	'5. Exchange Rate': string;
	'6. Last Refreshed': string;
	'7. Time Zone': string;
	'8. Bid Price': string;
	'9. Ask Price': string;
}

export function getCryptoEmbed(rate: CurrencyExchangeRate): EmbedBuilder {
	const price = parseFloat(rate['5. Exchange Rate']);
	const formatted = price > 1 ? fmt(String(price)) : price.toFixed(4);
	const bid = parseFloat(rate['8. Bid Price']);
	const ask = parseFloat(rate['9. Ask Price']);
	const spread = ask - bid;
	const name = rate['2. From_Currency Name'] ?? rate['1. From_Currency Code'];
	const symbol = rate['1. From_Currency Code'];

	return new EmbedBuilder()
		.setColor(0xF7931A)
		.setTitle(`${name} (${symbol})`)
		.setDescription(`**$${formatted}** USD`)
		.addFields(
			{ name: 'Bid', value: `$${fmt(String(bid))}`, inline: true },
			{ name: 'Ask', value: `$${fmt(String(ask))}`, inline: true },
			{ name: 'Spread', value: `$${spread > 1 ? fmt(String(spread)) : spread.toFixed(4)}`, inline: true },
		)
		.setFooter({ text: `${rate['6. Last Refreshed']} ${rate['7. Time Zone']}  •  Alpha Vantage` })
		.setTimestamp();
}

interface CommodityDataPoint {
	date: string;
	value: string;
}

interface CommodityResponse {
	name: string;
	unit: string;
	data: CommodityDataPoint[];
}

const COMMODITY_COLORS: Record<string, number> = {
	'WTI': 0x1E3A5F,
	'BRENT': 0x2D4A6F,
	'NATURAL_GAS': 0xF97316,
};

export function getCommodityEmbed(func: string, response: CommodityResponse): EmbedBuilder {
	const recent = response.data.filter(d => d.value !== '.').slice(0, 5);
	if (!recent.length) {
		return new EmbedBuilder()
			.setColor(0x6B7280)
			.setTitle(response.name)
			.setDescription('No recent data available.');
	}

	const latest = recent[0];
	const price = parseFloat(latest.value);
	const color = COMMODITY_COLORS[func] ?? 0x6B7280;

	// Calculate change from previous day if available
	let changeStr = '';
	if (recent.length >= 2) {
		const prev = parseFloat(recent[1].value);
		const change = price - prev;
		const changePct = (change / prev) * 100;
		const sign = change >= 0 ? '+' : '';
		const indicator = change >= 0 ? '🟢' : '🔴';
		changeStr = `${indicator} ${sign}$${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
	}

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(`${response.name}  —  $${fmt(String(price))}`)
		.setFooter({ text: `${latest.date}  •  ${response.unit}  •  Alpha Vantage` })
		.setTimestamp();

	if (changeStr) {
		embed.setDescription(changeStr + ' from previous day');
	}

	// Show last 5 days
	if (recent.length >= 3) {
		const history = recent
			.slice(0, 5)
			.reverse()
			.map(d => `${d.date.slice(5)}: $${fmt(d.value)}`)
			.join('\n');
		embed.addFields({ name: 'Recent', value: `\`\`\`\n${history}\n\`\`\``, inline: false });
	}

	return embed;
}
