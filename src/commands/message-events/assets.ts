import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { getAssetEmbed } from '../../embeds/asset-embeds';
import { getAssetPrice, getPrice, toAssetType, PriceData, AssetType } from '../../utils/priceApi';
import { WatchedTickers } from '../../models/dbObjects';

const TICKER_RE = /\$([a-zA-Z][a-zA-Z0-9._-]{0,9})\b/g;
const MAX_RESULTS = 4;

interface TickerRow {
	symbol: string;
	name: string | null;
	type: string;
}

interface ResolvedTicker {
	symbol: string;
	name?: string;
	type: AssetType;
	tracked: boolean;
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

	// Exact-only for ≤3 chars (SPY≠SPX), 1 for 4-5, 2 for 6+
	if (q.length <= 3) return null;
	const threshold = q.length <= 5 ? 1 : 2;
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
		if (tokens.length > MAX_RESULTS) tokens.length = MAX_RESULTS;

		const tickers = (await WatchedTickers.findAll({
			where: { guild_id: message.guildId },
		})) as unknown as TickerRow[];

		// Resolve each token: tracked ticker first, then raw lookup
		const resolved: ResolvedTicker[] = [];
		const seenSymbols = new Set<string>();
		for (const tok of tokens) {
			const row = findTicker(tok, tickers);
			const sym = row?.symbol ?? tok;
			if (seenSymbols.has(sym)) continue;
			seenSymbols.add(sym);
			resolved.push(row
				? { symbol: row.symbol, name: row.name ?? undefined, type: toAssetType(row.type), tracked: true }
				: { symbol: tok, type: 'stock', tracked: false },
			);
		}
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
			const embeds = results
				.filter((r): r is { resolved: ResolvedTicker; price: PriceData } => r !== null)
				.map(r => getAssetEmbed(r.price, r.resolved.type, r.resolved.name));
			if (!embeds.length) return;
			await message.reply({ embeds });
		}
		catch (error) {
			logger.error('asset lookup error:', error);
		}
	},
};

export default messageEvent;
