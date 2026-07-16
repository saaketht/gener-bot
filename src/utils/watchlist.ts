import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getAssetPrice, getHistory, toAssetType, inferAssetType, AssetType, RANGE_LABELS } from './priceApi';
import { renderWatchlistCard, renderComparisonOverlay, rowFromPrice, rowFromHistory, WatchlistRow } from '../embeds/asset-watchlist';
import { buildWatchlistButtons, WatchlistView } from '../embeds/asset-embeds';
import { WatchlistItems } from '../models/dbObjects';

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

// Parse `$TICKER` tokens from message text and resolve each against the guild
// watchlist (fuzzy-matched for display names), falling back to static type
// inference — any symbol works untracked; the watchlist only adds nice names.
// Shared by the `assets` message handler and the legacy watchlist buttons.
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

	const tickers = (await WatchlistItems.findAll({ where: { guild_id: guildId, owner_id: '' } })) as unknown as TickerRow[];

	const resolved: ResolvedTicker[] = [];
	const seenSymbols = new Set<string>();
	for (const tok of tokens) {
		const row = findTicker(tok, tickers);
		const sym = row?.symbol ?? tok;
		if (seenSymbols.has(sym)) continue;
		seenSymbols.add(sym);
		resolved.push(row
			? { symbol: row.symbol, name: row.name ?? undefined, type: toAssetType(row.type), tracked: true }
			: { symbol: tok, type: inferAssetType(tok), tracked: false },
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
export function buildWatchlistMessage(card: Buffer, count: number, range: string, view: WatchlistView = 'rows'): WatchlistMessage {
	const label = RANGE_LABELS[range] ?? range.toUpperCase();
	const embed = new EmbedBuilder()
		.setColor(0x2B2D31)
		.setImage('attachment://watchlist.png')
		.setFooter({ text: `${count} tickers  •  ${label}  •  yahoo` })
		.setTimestamp();
	return {
		embeds: [embed],
		files: [new AttachmentBuilder(card, { name: 'watchlist.png' })],
		components: buildWatchlistButtons(range, view),
	};
}

// Fetch live/history data for each ticker at the given timeframe and build the
// card rows. Shared by the content-based and DB-backed views.
async function fetchRows(resolved: ResolvedTicker[], range: string, force: boolean): Promise<WatchlistRow[]> {
	const rows = await Promise.all(resolved.map(async (r): Promise<WatchlistRow | null> => {
		if (range === '1d') {
			const price = await getAssetPrice(r.symbol, r.type, force);
			return price ? rowFromPrice(price, r.type, r.name) : null;
		}
		const hist = await getHistory(r.symbol, range, r.type, force);
		return hist ? rowFromHistory(hist, r.type, r.name) : null;
	}));
	return rows.filter((x): x is WatchlistRow => x !== null);
}

// Fetch every resolved ticker at the given timeframe, build the card, and return
// the full message payload. Symbols are re-derived from the original message
// text, so this is stateless and survives restarts. force bypasses the caches.
export async function resolveWatchlistView(
	content: string, guildId: string, range: string, force = false, view: WatchlistView = 'rows',
): Promise<WatchlistMessage | null> {
	const resolved = await resolveTickers(content, guildId);
	if (resolved.length < 2) return null;

	const ok = await fetchRows(resolved, range, force);
	if (ok.length < 2) return null;

	const card = view === 'overlay'
		? renderComparisonOverlay(ok, RANGE_LABELS[range] ?? range.toUpperCase())
		: renderWatchlistCard(ok);
	return card ? buildWatchlistMessage(card, ok.length, range, view) : null;
}

// ── DB-backed watchlists (guild list + per-user lists) ──

export const WATCHLIST_PAGE_SIZE = 8;
export const WATCHLIST_CAP = 32;

// ownerKey: '' = the guild list, otherwise a user ID.
export interface WatchlistItem {
	symbol: string;
	type: AssetType;
	name?: string;
}

export async function getListItems(guildId: string, ownerKey: string): Promise<WatchlistItem[]> {
	const rows: any[] = await WatchlistItems.findAll({
		where: { guild_id: guildId, owner_id: ownerKey },
		order: [['id', 'ASC']],
	});
	return rows.map(r => ({ symbol: r.symbol, type: toAssetType(r.type), name: r.name ?? undefined }));
}

// A user's personal list when it has entries, else the guild list.
export async function resolveOwnerList(guildId: string, userId: string): Promise<{ ownerKey: string; items: WatchlistItem[] }> {
	const personal = await getListItems(guildId, userId);
	if (personal.length > 0) return { ownerKey: userId, items: personal };
	return { ownerKey: '', items: await getListItems(guildId, '') };
}

export type MutateResult = { ok: true; symbol: string; name?: string } | { ok: false; error: string };

// Anyone can curate the guild list (ownerKey '') for now — deliberate, it's one
// friendly server. If that gets abused, gate ownerKey==='' mutations on
// process.env.privilegedIds here (single choke point for all curation paths).
export async function addWatchlistItem(guildId: string, ownerKey: string, symbol: string, addedBy: string): Promise<MutateResult> {
	const sym = symbol.toUpperCase().replace(/^\$/, '');
	if (!/^[A-Z][A-Z0-9._-]{0,9}$/.test(sym)) return { ok: false, error: `invalid symbol: ${symbol}` };

	const count = await WatchlistItems.count({ where: { guild_id: guildId, owner_id: ownerKey } });
	if (count >= WATCHLIST_CAP) return { ok: false, error: `list is full (${WATCHLIST_CAP} max)` };

	const existing = await WatchlistItems.findOne({ where: { guild_id: guildId, owner_id: ownerKey, symbol: sym } });
	if (existing) return { ok: false, error: `${sym} is already on the list` };

	// Validate against the live API before saving — also captures a display name.
	const type = inferAssetType(sym);
	const price = await getAssetPrice(sym, type);
	if (!price) return { ok: false, error: `no price data for ${sym} — is that a real ticker?` };

	await WatchlistItems.create({ guild_id: guildId, owner_id: ownerKey, symbol: sym, type, name: price.name ?? null, added_by: addedBy });
	return { ok: true, symbol: sym, name: price.name ?? undefined };
}

export async function removeWatchlistItem(guildId: string, ownerKey: string, symbol: string): Promise<MutateResult> {
	const sym = symbol.toUpperCase().replace(/^\$/, '');
	const deleted = await WatchlistItems.destroy({ where: { guild_id: guildId, owner_id: ownerKey, symbol: sym } });
	if (deleted === 0) return { ok: false, error: `${sym} isn't on the list` };
	return { ok: true, symbol: sym };
}

const DB_TIMEFRAMES = ['1d', '1w', '1m', '3m', 'ytd', '1y', '5y', 'all'];

// customId: wldb_<view>_<range>_<page>_<ownerKey> ('g' encodes the guild list —
// no symbols in the id, so parsing is unambiguous and survives restarts).
export function buildDbWatchlistButtons(active: string, view: WatchlistView, page: number, totalPages: number, ownerKey: string): ActionRowBuilder<ButtonBuilder>[] {
	const owner = ownerKey === '' ? 'g' : ownerKey;
	const id = (kind: string, range: string, pg: number) => `wldb_${kind}_${view}_${range}_${pg}_${owner}`;

	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let i = 0; i < DB_TIMEFRAMES.length; i += 5) {
		const row = new ActionRowBuilder<ButtonBuilder>();
		for (const range of DB_TIMEFRAMES.slice(i, i + 5)) {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(id('tf', range, page))
					.setLabel(RANGE_LABELS[range])
					.setStyle(range === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
					.setDisabled(range === active),
			);
		}
		rows.push(row);
	}

	const lastRow = rows[rows.length - 1];
	lastRow.addComponents(
		new ButtonBuilder().setCustomId(id('refresh', active, page)).setEmoji('🔄').setStyle(ButtonStyle.Secondary),
	);
	const targetView = view === 'overlay' ? 'rows' : 'overlay';
	lastRow.addComponents(
		new ButtonBuilder()
			.setCustomId(`wldb_view_${targetView}_${active}_${page}_${owner}`)
			.setEmoji(targetView === 'overlay' ? '📈' : '📋')
			.setStyle(ButtonStyle.Secondary),
	);

	if (totalPages > 1) {
		rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(id('tf', active, page - 1)).setEmoji('◀').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
			new ButtonBuilder().setCustomId(`wldb_noop_${page}`).setLabel(`${page + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
			new ButtonBuilder().setCustomId(id('tf', active, page + 1)).setEmoji('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
		));
	}
	return rows;
}

export interface DbWatchlistParams {
	view: WatchlistView;
	range: string;
	page: number;
	ownerKey: string;
	force: boolean;
}

export function parseDbWatchlistCustomId(customId: string): DbWatchlistParams | null {
	// wldb_<kind>_<view>_<range>_<page>_<owner>
	const parts = customId.split('_');
	if (parts[0] !== 'wldb' || parts.length < 6) return null;
	const [, kind, viewRaw, range, pageRaw, owner] = parts;
	if (kind === 'noop') return null;
	const page = parseInt(pageRaw);
	if (!DB_TIMEFRAMES.includes(range) || isNaN(page)) return null;
	// For kind 'view' the id already carries the TARGET view (the toggle).
	const view: WatchlistView = viewRaw === 'overlay' ? 'overlay' : 'rows';
	return {
		view,
		range,
		page: Math.max(0, page),
		ownerKey: owner === 'g' ? '' : owner,
		force: kind === 'refresh',
	};
}

// Build the paginated card for a DB-backed list. Pages hold WATCHLIST_PAGE_SIZE
// rows; the last page renders however many remain (variable-height card).
export async function resolveDbWatchlistView(
	guildId: string, ownerKey: string, range: string, page: number, force = false, view: WatchlistView = 'rows',
): Promise<WatchlistMessage | null> {
	const items = await getListItems(guildId, ownerKey);
	if (items.length === 0) return null;

	const totalPages = Math.ceil(items.length / WATCHLIST_PAGE_SIZE);
	const pg = Math.min(Math.max(0, page), totalPages - 1);
	const slice = items.slice(pg * WATCHLIST_PAGE_SIZE, (pg + 1) * WATCHLIST_PAGE_SIZE);

	const ok = await fetchRows(slice.map(i => ({ ...i, tracked: true })), range, force);
	if (ok.length === 0) return null;

	const card = view === 'overlay'
		? renderComparisonOverlay(ok, RANGE_LABELS[range] ?? range.toUpperCase())
		: renderWatchlistCard(ok);
	if (!card) return null;

	const label = RANGE_LABELS[range] ?? range.toUpperCase();
	const scope = ownerKey === '' ? 'guild watchlist' : 'personal watchlist';
	const pageNote = totalPages > 1 ? `  •  page ${pg + 1}/${totalPages}` : '';
	const embed = new EmbedBuilder()
		.setColor(0x2B2D31)
		.setImage('attachment://watchlist.png')
		.setFooter({ text: `${scope}  •  ${items.length} tickers${pageNote}  •  ${label}  •  yahoo` })
		.setTimestamp();
	return {
		embeds: [embed],
		files: [new AttachmentBuilder(card, { name: 'watchlist.png' })],
		components: buildDbWatchlistButtons(range, view, pg, totalPages, ownerKey),
	};
}
