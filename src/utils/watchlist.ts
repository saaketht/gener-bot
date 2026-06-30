import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getAssetPrice, getHistory, toAssetType, AssetType, RANGE_LABELS } from './priceApi';
import { renderWatchlistCard, rowFromPrice, rowFromHistory, WatchlistRow } from '../embeds/asset-watchlist';
import { buildWatchlistButtons } from '../embeds/asset-embeds';
import { WatchedTickers } from '../models/dbObjects';

const TICKER_RE = /\$([a-zA-Z][a-zA-Z0-9._-]{0,9})\b/g;
const MAX_RESULTS = 4;

interface TickerRow {
	symbol: string;
	name: string | null;
	type: string;
}

export interface ResolvedTicker {
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
		const symbol = t.symbol.toUpperCase();
		// Symbol fuzzy-match requires equal length: length-changing edits
		// (QQQM↔QQQ, GOOGL↔GOOG) are almost always distinct tickers, not typos.
		if (symbol.length === q.length) {
			const d = levenshtein(q, symbol);
			if (d <= threshold && (!best || d < best.dist)) best = { row: t, dist: d };
		}
		if (t.name) {
			for (const word of t.name.toUpperCase().split(/\s+/)) {
				if (!word) continue;
				const d = levenshtein(q, word);
				if (d <= threshold && (!best || d < best.dist)) best = { row: t, dist: d };
			}
		}
	}
	return best?.row ?? null;
}

// Parse `$TICKER` tokens from message text and resolve each against the guild's
// WatchedTickers (fuzzy-matched), falling back to a raw untracked stock lookup.
// Shared by the `assets` message handler and the watchlist button handler.
export async function resolveTickers(content: string, guildId: string): Promise<ResolvedTicker[]> {
	const matches = [...content.matchAll(TICKER_RE)];
	if (!matches.length) return [];

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

	const tickers = (await WatchedTickers.findAll({ where: { guild_id: guildId } })) as unknown as TickerRow[];

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
	return resolved;
}

export interface WatchlistMessage {
	embeds: EmbedBuilder[];
	files: AttachmentBuilder[];
	components: ReturnType<typeof buildWatchlistButtons>;
}

// Assemble the reply/edit payload for a rendered watchlist card: embed + image
// attachment + timeframe buttons. Shared so the initial render and the button
// handler produce an identical message.
export function buildWatchlistMessage(card: Buffer, count: number, range: string): WatchlistMessage {
	const label = RANGE_LABELS[range] ?? range.toUpperCase();
	const embed = new EmbedBuilder()
		.setColor(0x2B2D31)
		.setImage('attachment://watchlist.png')
		.setFooter({ text: `${count} tickers  •  ${label}  •  yahoo` })
		.setTimestamp();
	return {
		embeds: [embed],
		files: [new AttachmentBuilder(card, { name: 'watchlist.png' })],
		components: buildWatchlistButtons(range),
	};
}

// Fetch every resolved ticker at the given timeframe, build the card, and return
// the full message payload. Symbols are re-derived from the original message
// text, so this is stateless and survives restarts. force bypasses the caches.
export async function resolveWatchlistView(
	content: string, guildId: string, range: string, force = false,
): Promise<WatchlistMessage | null> {
	const resolved = await resolveTickers(content, guildId);
	if (resolved.length < 2) return null;

	const rows = await Promise.all(resolved.map(async (r): Promise<WatchlistRow | null> => {
		if (range === '1d') {
			const price = await getAssetPrice(r.symbol, r.type, force);
			return price ? rowFromPrice(price, r.type, r.name) : null;
		}
		const hist = await getHistory(r.symbol, range, r.type, force);
		return hist ? rowFromHistory(hist, r.type, r.name) : null;
	}));

	const ok = rows.filter((x): x is WatchlistRow => x !== null);
	if (ok.length < 2) return null;

	const card = renderWatchlistCard(ok);
	return card ? buildWatchlistMessage(card, ok.length, range) : null;
}
