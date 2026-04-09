import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { getAssetEmbed } from '../../embeds/asset-embeds';
import { getAssetPrice, toAssetType, PriceData } from '../../utils/priceApi';
import { WatchedTickers } from '../../models/dbObjects';

const TICKER_RE = /\$([a-zA-Z][a-zA-Z0-9._-]{0,9})\b/g;
const MAX_RESULTS = 4;

interface TickerRow {
	symbol: string;
	name: string | null;
	type: string;
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	const prev = new Array(b.length + 1);
	const curr = new Array(b.length + 1);
	for (let j = 0; j <= b.length; j++) prev[j] = j;
	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
	}
	return prev[b.length];
}

function findTicker(query: string, tickers: TickerRow[]): TickerRow | null {
	const q = query.toUpperCase();
	const exact = tickers.find(t => t.symbol.toUpperCase() === q);
	if (exact) return exact;

	const threshold = q.length <= 4 ? 1 : 2;
	let best: { row: TickerRow; dist: number } | null = null;
	for (const t of tickers) {
		const candidates = [t.symbol.toUpperCase()];
		if (t.name) {
			for (const word of t.name.toUpperCase().split(/\s+/)) {
				if (word) candidates.push(word);
			}
		}
		for (const c of candidates) {
			const d = levenshtein(q, c);
			if (d <= threshold && (!best || d < best.dist)) {
				best = { row: t, dist: d };
			}
		}
	}
	return best?.row ?? null;
}

const messageEvent: MessageEvent = {
	name: 'assets',
	async execute(message) {
		if (message.author.bot) return;
		if (!message.guildId) return;
		const content = message.content;

		if (content.toLowerCase().includes('crypto-api-info')) {
			await message.reply('Live prices via Finnhub (stocks/ETFs) with Yahoo Finance fallback for crypto and commodities.');
			return;
		}

		const matches = [...content.matchAll(TICKER_RE)];
		if (!matches.length) return;

		// Dedup tokens, preserve order
		const seen = new Set<string>();
		const tokens: string[] = [];
		for (const m of matches) {
			const t = m[1].toUpperCase();
			if (!seen.has(t)) {
				seen.add(t);
				tokens.push(t);
			}
		}

		const tickers = (await WatchedTickers.findAll({
			where: { guild_id: message.guildId },
		})) as unknown as TickerRow[];
		if (!tickers.length) return;

		const resolved: TickerRow[] = [];
		for (const tok of tokens) {
			const row = findTicker(tok, tickers);
			if (row && !resolved.find(r => r.symbol === row.symbol)) {
				resolved.push(row);
			}
			if (resolved.length >= MAX_RESULTS) break;
		}
		if (!resolved.length) return;

		try {
			if ('sendTyping' in message.channel) await message.channel.sendTyping();
			const results = await Promise.all(
				resolved.map(async (row): Promise<{ row: TickerRow; price: PriceData } | null> => {
					const price = await getAssetPrice(row.symbol, toAssetType(row.type));
					return price ? { row, price } : null;
				}),
			);
			const embeds = results
				.filter((r): r is { row: TickerRow; price: PriceData } => r !== null)
				.map(r => getAssetEmbed(r.price, toAssetType(r.row.type), r.row.name ?? undefined));
			if (!embeds.length) return;
			await message.reply({ embeds });
		}
		catch (error) {
			logger.error('asset lookup error:', error);
		}
	},
};

export default messageEvent;
