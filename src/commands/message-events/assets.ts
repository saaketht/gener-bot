import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { getAssetEmbed, buildTimeframeRows } from '../../embeds/asset-embeds';
import { renderWatchlistCard, rowFromPrice } from '../../embeds/asset-watchlist';
import { getAssetPrice, getPrice, PriceData } from '../../utils/priceApi';
import { resolveTickers, buildWatchlistMessage, ResolvedTicker } from '../../utils/watchlist';

async function fetchPrice(resolved: ResolvedTicker): Promise<PriceData | null> {
	if (resolved.tracked) return getAssetPrice(resolved.symbol, resolved.type);
	// Untracked: try raw symbol (works for any stock/ETF on major exchanges)
	return getPrice(resolved.symbol);
}

const messageEvent: MessageEvent = {
	name: 'assets',
	async execute(message) {
		if (message.author.bot) return;
		if (!message.guildId) return;
		// Skip if this is an AI query — ai-complete handles financial lookups itself
		if (message.content.match(/^ai\s/i)) return;
		const content = message.content;

		if (content.toLowerCase().includes('crypto-api-info')) {
			await message.reply('Live prices via Finnhub (stocks/ETFs) with Yahoo Finance fallback for crypto and commodities.');
			return;
		}

		const resolved = await resolveTickers(content, message.guildId);
		if (!resolved.length) return;

		logger.info(`asset lookup: ${message.author.username} → [${resolved.map(r => `${r.symbol}${r.tracked ? '' : ' (untracked)'}`).join(', ')}]`);

		try {
			if ('sendTyping' in message.channel) await message.channel.sendTyping();
			const results = await Promise.all(
				resolved.map(async (r): Promise<{ resolved: ResolvedTicker; price: PriceData } | null> => {
					const price = await fetchPrice(r);
					if (!price) logger.warn(`asset fetch returned null for ${r.symbol} (${r.type})`);
					return price ? { resolved: r, price } : null;
				}),
			);
			const successful = results.filter(
				(r): r is { resolved: ResolvedTicker; price: PriceData } => r !== null,
			);
			if (!successful.length) return;

			// 2+ tickers collapse into a single watchlist card (with timeframe buttons)
			// so we don't flood the channel with stacked 800x400 PNGs.
			if (successful.length >= 2) {
				const card = renderWatchlistCard(successful.map(r => rowFromPrice(r.price, r.resolved.type, r.resolved.name)));
				if (card) {
					await message.reply(buildWatchlistMessage(card, successful.length, '1d'));
					return;
				}
			}

			const built = successful.map(r => getAssetEmbed(r.price, r.resolved.type, r.resolved.name));
			// Single-ticker replies get the per-ticker timeframe + candle buttons.
			const components = successful.length === 1
				? buildTimeframeRows(successful[0].price.symbol, successful[0].resolved.type, '1d')
				: [];
			await message.reply({
				embeds: built.map(b => b.embed),
				files: built.flatMap(b => b.files),
				components,
			});
		}
		catch (error) {
			logger.error('asset lookup error:', error);
		}
	},
};

export default messageEvent;
