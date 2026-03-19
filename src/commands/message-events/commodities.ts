import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { getStockQuoteEmbed, getCryptoEmbed, getCommodityEmbed } from '../../embeds/asset-embeds';

const cryptos = new Map([
	['bitcoin', 'BTC'],
	['ethereum', 'ETH'],
	['bnb', 'BNB'],
	['xrp', 'XRP'],
	['cardano', 'ADA'],
	['solana', 'SOL'],
	['monero', 'XMR'],
	['helium', 'HNT'],
	['litecoin', 'LTC'],
	['dogecoin', 'DOGE'],
]);

const stocks = new Map([
	['spy', 'SPY'],
	['qqq', 'QQQ'],
	['gold', 'GLD'],
	['silver', 'SLV'],
]);

// Alpha Vantage commodity function names (not ticker symbols)
const commodities = new Map([
	['oil', 'WTI'],
	['crude', 'WTI'],
	['brent', 'BRENT'],
	['gas', 'NATURAL_GAS'],
]);

const RAPIDAPI_HOST = 'alpha-vantage.p.rapidapi.com';
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/query`;

const headers = () => ({
	'x-rapidapi-host': RAPIDAPI_HOST,
	'x-rapidapi-key': process.env.rapidApiKey!,
});

async function fetchJSON(params: Record<string, string>) {
	const url = new URL(RAPIDAPI_URL);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	const res = await fetch(url.toString(), { headers: headers() });
	if (!res.ok) throw new Error(`API returned ${res.status}`);
	return res.json();
}

const messageEvent: MessageEvent = {
	name: 'commodities',
	async execute(message) {
		if (message.author.bot) return;
		const words = message.content.toLowerCase().split(/\s+/);

		if (words.includes('crypto-api-info')) {
			await message.reply('Alpha Vantage via RapidAPI — 500/day hard limit, 5 req/min');
			return;
		}

		// Check cryptos (currency exchange rate endpoint)
		const cryptoWord = words.find(w => cryptos.has(w));
		if (cryptoWord) {
			const symbol = cryptos.get(cryptoWord)!;
			logger.debug(`crypto lookup: ${cryptoWord} (${symbol})`);
			try {
				const data = await fetchJSON({
					function: 'CURRENCY_EXCHANGE_RATE',
					from_currency: symbol,
					to_currency: 'USD',
				});
				const rate = data['Realtime Currency Exchange Rate'];
				await message.reply({ embeds: [getCryptoEmbed(rate)] });
			} catch (error) {
				logger.error('crypto error:', error);
			}
			return;
		}

		// Check stocks (global quote endpoint)
		const stockWord = words.find(w => stocks.has(w));
		if (stockWord) {
			const symbol = stocks.get(stockWord)!;
			logger.debug(`stock lookup: ${stockWord} (${symbol})`);
			try {
				const data = await fetchJSON({
					function: 'GLOBAL_QUOTE',
					symbol,
				});
				const quote = data['Global Quote'];
				await message.reply({ embeds: [getStockQuoteEmbed(quote)] });
			} catch (error) {
				logger.error('stock error:', error);
			}
			return;
		}

		// Check commodities (dedicated commodity endpoint — returns daily time series)
		const commodityWord = words.find(w => commodities.has(w));
		if (commodityWord) {
			const func = commodities.get(commodityWord)!;
			logger.debug(`commodity lookup: ${commodityWord} (${func})`);
			try {
				const data = await fetchJSON({
					function: func,
					interval: 'daily',
				});
				if (!data.data?.length) {
					await message.reply(`No recent data for ${commodityWord}.`);
					return;
				}
				await message.reply({ embeds: [getCommodityEmbed(func, data)] });
			} catch (error) {
				logger.error('commodity error:', error);
			}
			return;
		}
	},
};

export default messageEvent;
