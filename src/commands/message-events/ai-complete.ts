import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Message, EmbedBuilder } from 'discord.js';
import { MessageEvent } from '../../types';
import { rateLimiter } from '../../utils/rateLimiter';
import logger from '../../utils/logger';
import { getAiErrorEmbed } from '../../embeds/embeds';
import { COMMAND_MANIFEST } from '../../utils/commandManifest';
import { fetchUserContext } from '../../utils/userContext';
import { WatchedTickers, UserProfiles, ChannelHistory, dbReady } from '../../models/dbObjects';
import { getAssetPrice, getPrice, getHistory, toAssetType } from '../../utils/priceApi';
import { readTradesCSV } from '../../utils/tradeData';
import { parseTradesCSV, normalizeDate, getTodayDateStr, getPnlEmbed } from '../../embeds/pnl-embeds';
import { getUniqueTradingDays, getDaySummary, getRecapEmbed } from '../../embeds/recap-embeds';
import { getAssetEmbed, getHistoryEmbed, buildTimeframeRows } from '../../embeds/asset-embeds';
import { searchImage } from '../../utils/imageSearch';
import { createReminder } from '../../utils/reminders';
import { fetchFlightStatus } from '../../utils/flightApi';
import { getFlightTrackingEmbed } from '../../embeds/flight-embeds';
import { isToolLoopActive, getToolUses } from './toolLoop';

const grok = new OpenAI({
	apiKey: process.env.GROK_API_KEY!,
	baseURL: 'https://api.x.ai/v1',
});

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const MODEL = 'grok-4.3';
const CLAUDE_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;
const CLAUDE_MAX_TOKENS = 2048;
const DEFAULT_PROMPT = 'You are generbot, a concise and direct AI assistant.';

// Claude handles financial/ticker queries (grounded, no hallucination). When it's
// unavailable — no key, or set CLAUDE_DISABLED=true while out of credits — financial
// queries fall back to Grok using the same finance prompt + tools. A live Claude call
// that throws also falls back to Grok rather than erroring out (see execute()).
const CLAUDE_ENABLED = !!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_DISABLED !== 'true';

// ── Claude availability circuit breaker ──
// There is no proactive credit check; availability is inferred from live calls. After
// CLAUDE_FAILURE_THRESHOLD consecutive failures (e.g. out of credits) the circuit opens
// and financial queries route straight to Grok — no per-request failed Claude call — for
// CLAUDE_COOLDOWN_MS. Once the cooldown elapses the next financial request is allowed
// through as a probe: success closes the circuit, failure re-opens it for another cooldown.
// In-memory, so it resets on restart (same as the channel history / caches above).
const CLAUDE_FAILURE_THRESHOLD = 3;
const CLAUDE_COOLDOWN_MS = 30 * 60 * 1000;
let claudeConsecutiveFailures = 0;
// Timestamp the circuit opened; 0 means closed.
let claudeCircuitOpenedAt = 0;

// True when a Claude attempt is allowed: circuit closed, or open but cooled down (probe).
function claudeCircuitAllows(): boolean {
	if (claudeCircuitOpenedAt === 0) return true;
	return Date.now() - claudeCircuitOpenedAt >= CLAUDE_COOLDOWN_MS;
}

function recordClaudeSuccess(): void {
	if (claudeCircuitOpenedAt !== 0) {
		logger.info('claude circuit closed after successful probe');
	}
	claudeConsecutiveFailures = 0;
	claudeCircuitOpenedAt = 0;
}

function recordClaudeFailure(): void {
	claudeConsecutiveFailures++;
	if (claudeConsecutiveFailures >= CLAUDE_FAILURE_THRESHOLD) {
		// (Re)open the circuit and restart the cooldown clock.
		claudeCircuitOpenedAt = Date.now();
		logger.warn(`claude circuit open (${claudeConsecutiveFailures} consecutive failures); routing financial queries to grok for ${CLAUDE_COOLDOWN_MS / 60000}min`);
	}
}

// Detect financial intent: $TICKER notation or unambiguous financial keywords.
// Deliberately excludes common-in-conversation words (price, call, put, volume,
// shares, float, beta, hedge, option, strike, expir) — those routed everyday chat
// ("should i call him") to the finance model. A bare $TICKER is the strong signal.
const FINANCIAL_TICKER_RE = /\$[A-Za-z]{1,6}\b/;
const FINANCIAL_KW_RE = /\b(market.?cap|earnings|dividends?|tickers?|stocks?|crypto|etfs?|implied.?vol|iv.?rank|p\/e|short.?interest|bullish|bearish|0dte|portfolio)\b/i;

function isFinancialQuery(text: string): boolean {
	return FINANCIAL_TICKER_RE.test(text) || FINANCIAL_KW_RE.test(text);
}

function loadPrompt(filename: string): string {
	// ts-node: src/commands/message-events/ → 3 up = root
	// compiled: built/src/commands/message-events/ → 4 up = root
	const levels = __dirname.includes('built') ? 4 : 3;
	const root = resolve(__dirname, ...Array(levels).fill('..'));
	const promptsDir = process.env.PROMPTS_DIR || join(root, 'prompts');
	try {
		return readFileSync(join(promptsDir, filename), 'utf-8').trim();
	}
	catch {
		logger.warn(`Failed to load prompt from ${promptsDir}/${filename}, using default`);
		return DEFAULT_PROMPT;
	}
}

const SYSTEM_PROMPT = loadPrompt('generbot.txt');
const FINANCIAL_SYSTEM_PROMPT = loadPrompt('generbot_finance.txt');

const CONV_FORMAT = '\n\nConversation format: each turn is wrapped as <msg from="username">text</msg>. The "from" attribute identifies the speaker — multiple users may participate in one thread. Your own past replies are tagged from="generBot". Never include these tags in your own output.';

// Stable prefix shared by every Claude financial call: base prompt + command
// manifest + conversation format. Frozen at module load so the bytes never vary —
// per-user data goes in a separate block AFTER the cache breakpoint.
const FINANCIAL_PREFIX = FINANCIAL_SYSTEM_PROMPT
	+ '\n\nBot capabilities (mention casually when relevant, don\'t list them all):\n' + COMMAND_MANIFEST
	+ CONV_FORMAT;

// Current time for the model (reminder math, "today" questions). Volatile —
// must never be interpolated into the cached FINANCIAL_PREFIX.
function nowLine(): string {
	const et = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short',
	}).format(new Date());
	return `\n\nCurrent time: ${et} (US Eastern)`;
}

function buildSystemPrompt(userContextStr: string): string {
	return SYSTEM_PROMPT
		+ '\n\nBot capabilities (mention casually when relevant, don\'t list them all):\n' + COMMAND_MANIFEST
		+ CONV_FORMAT
		+ '\n\nUser data: ' + userContextStr
		+ nowLine();
}

// String form — used by the Grok financial fallback (Responses API takes a string).
function buildFinancialSystemPrompt(userContextStr: string): string {
	return FINANCIAL_PREFIX + '\n\nUser data: ' + userContextStr + nowLine();
}

// Block form for Claude: cache_control on the stable prefix caches tools + prefix
// across tool-loop rounds and across messages (5min TTL). Volatile content (user
// data, current time) sits in the second block after the breakpoint.
function buildFinancialSystemBlocks(userContextStr: string): Anthropic.TextBlockParam[] {
	return [
		{ type: 'text', text: FINANCIAL_PREFIX, cache_control: { type: 'ephemeral' } },
		{ type: 'text', text: 'User data: ' + userContextStr + nowLine() },
	];
}

function chunkText(text: string, maxLen = 2000): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < text.length; i += maxLen) {
		chunks.push(text.substring(i, i + maxLen));
	}
	return chunks;
}

// Maps any bot message ID to the full completion text it was part of.
// Used to recover the full (chunk-merged) answer when a user replies to a bot message.
// In-memory + LRU + wiped on restart, so it is best-effort: replies fall back to the
// replied-to message's own text when the entry has been evicted.
const responseCache = new Map<string, string>();
const CACHE_MAX = 300;

// Per-channel rolling chat history — the single source of conversational context for
// both `ai` commands and replies. Deliberately keyed by channelId (shared across all
// users in the channel): turns are wrapped in <msg from="..."> tags so the model can
// attribute speakers, which is the desired behaviour for a shared-channel bot. Switch
// the key to `${channelId}:${userId}` only if per-user isolation is ever wanted.
type ChatModel = 'claude' | 'grok';
type ChatTurn = { role: 'user' | 'assistant'; content: string; ts: number; model?: ChatModel };
const channelHistory = new Map<string, ChatTurn[]>();

// Hydrate the in-memory buffer from SQLite once the tables exist, so restarts
// don't wipe conversational context (or silently reset sticky-model routing).
// Writes happen fire-and-forget in recordChannelTurns.
dbReady.then(async () => {
	try {
		const rows: any[] = await ChannelHistory.findAll();
		let hydrated = 0;
		for (const row of rows) {
			try {
				const turns = JSON.parse(row.turns);
				if (Array.isArray(turns) && turns.length > 0) {
					channelHistory.set(row.channel_id, turns);
					hydrated++;
				}
			}
			catch {
				// corrupt row — skip it
			}
		}
		if (hydrated > 0) logger.info(`hydrated chat history for ${hydrated} channels`);
	}
	catch (err) {
		logger.warn('channel history hydration failed:', err);
	}
});
const HISTORY_MAX_TURNS = 16;
// Always keep at least the last HISTORY_FLOOR turns even if older than the TTL, so a
// paused thread retains context (and sticky-model routing doesn't silently reset).
const HISTORY_FLOOR = 4;
const HISTORY_TTL_MS = 3 * 60 * 60 * 1000;

function escapeXmlAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function wrapUser(username: string, text: string): string {
	return `<msg from="${escapeXmlAttr(username)}">${text}</msg>`;
}

function wrapAssistant(text: string): string {
	return `<msg from="generBot">${text}</msg>`;
}

// Short, single-line excerpt of a replied-to message, used to point the model at the
// specific earlier turn a reply refers to. Strips any <msg> wrapper and collapses whitespace.
function quoteExcerpt(text: string, maxLen = 300): string {
	const clean = text
		.replace(/<msg\s+from="[^"]*">/gi, '')
		.replace(/<\/msg>/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
	return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
}

function getChannelHistory(channelId: string): ChatTurn[] {
	const arr = channelHistory.get(channelId);
	if (!arr) return [];
	const cutoff = Date.now() - HISTORY_TTL_MS;
	const floorIdx = arr.length - HISTORY_FLOOR;
	const fresh = arr.filter((t, i) => t.ts >= cutoff || i >= floorIdx);
	if (fresh.length !== arr.length) {
		if (fresh.length === 0) channelHistory.delete(channelId);
		else channelHistory.set(channelId, fresh);
	}
	return fresh;
}

function recordChannelTurns(channelId: string, userContent: string, assistantContent: string, model: ChatModel) {
	const arr = channelHistory.get(channelId) ?? [];
	const now = Date.now();
	arr.push({ role: 'user', content: userContent, ts: now });
	arr.push({ role: 'assistant', content: assistantContent, ts: now, model });
	while (arr.length > HISTORY_MAX_TURNS) arr.shift();
	channelHistory.set(channelId, arr);
	// Persist so restarts keep context — fire-and-forget, never blocks the reply.
	ChannelHistory.upsert({ channel_id: channelId, turns: JSON.stringify(arr) })
		.catch(err => logger.warn('channel history persist failed:', err));
}

function lastChannelModel(channelId: string): ChatModel | null {
	const buffered = getChannelHistory(channelId);
	for (let i = buffered.length - 1; i >= 0; i--) {
		const t = buffered[i];
		if (t.role === 'assistant' && t.model) return t.model;
	}
	return null;
}

// Active AI generation state per channel — for cancellation
const activeGenerations = new Map<string, AbortController>();

// Last AI response per channel — for deletion
const DELETE_WINDOW_MS = 30_000;
const lastResponse = new Map<string, { sentIds: string[]; userId: string; timestamp: number }>();

const STOP_KEYWORDS = new Set(['stop', 'shut up', 'stfu']);

function cacheResponse(messageIds: string[], fullText: string) {
	for (const id of messageIds) {
		responseCache.set(id, fullText);
	}
	// Evict oldest entries if cache grows too large
	if (responseCache.size > CACHE_MAX) {
		const excess = responseCache.size - CACHE_MAX;
		const keys = responseCache.keys();
		for (let i = 0; i < excess; i++) {
			responseCache.delete(keys.next().value!);
		}
	}
}

// ── Tool definitions (canonical, converted to provider formats below) ──

interface ToolDef {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

const SHARED_TOOLS: ToolDef[] = [
	{
		name: 'lookup_ticker',
		description: 'Look up whether a symbol is a tracked financial instrument (stock, crypto, or commodity). Call this BEFORE discussing any financial instrument to verify it exists.',
		parameters: {
			type: 'object',
			properties: { symbol: { type: 'string', description: 'Ticker symbol, e.g. AAPL, BTC, SPY' } },
			required: ['symbol'],
		},
	},
	{
		name: 'get_price',
		description: 'Get current price data for any stock/ETF symbol, or a tracked crypto/commodity. Works for any valid ticker. Prefer this over web_search for price data.',
		parameters: {
			type: 'object',
			properties: {
				symbol: { type: 'string', description: 'Ticker symbol, e.g. AAPL, BTC, SPY' },
				show_embed: { type: 'boolean', description: 'Send a visual price card to the channel. Default false — set true when the user asks to "show", "pull up", or "check" a ticker.' },
			},
			required: ['symbol'],
		},
	},
	{
		name: 'get_trades',
		description: 'Get SPY 0DTE trading data. Returns today\'s trades by default, a specific date, or a multi-day recap. Use for PNL, trading performance, win rate, or any trade-related question.',
		parameters: {
			type: 'object',
			properties: {
				mode: { type: 'string', enum: ['today', 'date', 'recap'], description: 'today = current day, date = specific date, recap = multi-day summary' },
				date: { type: 'string', description: 'Date in M/D/YYYY format. Required when mode=date.' },
				days: { type: 'number', description: 'Number of days for recap mode (1-30, default 5)' },
				show_embed: { type: 'boolean', description: 'Send the visual PNL/recap embed to the channel. Default true. Set false to silently fetch data for analysis without showing the card.' },
			},
			required: ['mode'],
		},
	},
	{
		name: 'get_flight_status',
		description: 'Look up real-time flight status by flight number (e.g. UA123, DL456). Returns departure/arrival times, delays, gates, and progress.',
		parameters: {
			type: 'object',
			properties: {
				flight_number: { type: 'string', description: 'IATA flight number, e.g. UA123' },
				date: { type: 'string', description: 'Flight date as YYYY-MM-DD. Defaults to today.' },
				show_embed: { type: 'boolean', description: 'Send the visual flight tracking embed to the channel. Default true.' },
			},
			required: ['flight_number'],
		},
	},
	{
		name: 'get_chart',
		description: 'Show a price chart for any stock/ETF, or a tracked crypto/commodity, over a timeframe. Call this when the user asks how an asset has performed over time or wants to see a chart. Use range=1d for a live intraday view.',
		parameters: {
			type: 'object',
			properties: {
				symbol: { type: 'string', description: 'Ticker symbol, e.g. AAPL, BTC, SPY' },
				range: { type: 'string', enum: ['1d', '1w', '1m', '3m', 'ytd', '1y', '5y', 'all'], description: 'Chart timeframe' },
				show_embed: { type: 'boolean', description: 'Send the chart card (with timeframe buttons) to the channel. Default true.' },
			},
			required: ['symbol', 'range'],
		},
	},
	{
		name: 'get_weather',
		description: 'Get current weather for a city or place. Call this when the user asks about weather, temperature, or conditions somewhere. Returns data only — the "weather <city>" command shows the visual card.',
		parameters: {
			type: 'object',
			properties: {
				location: { type: 'string', description: 'City or place name, e.g. "new york", "tokyo"' },
			},
			required: ['location'],
		},
	},
	{
		name: 'search_image',
		description: 'Search the web for an image and post it to the channel. Call this when the user asks to see a picture or photo of something.',
		parameters: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Image search query' },
				index: { type: 'number', description: 'Optional result index (0-199). Omit for a random pick.' },
			},
			required: ['query'],
		},
	},
	{
		name: 'remember',
		description: 'Save a lasting fact about a user for future conversations. Call this when someone shares durable info (preferences, home airport, job, running jokes) or explicitly asks you to remember something — about themselves, or about a tagged user ("remember that @user flies out of SFO"). Do NOT save throwaway conversational details.',
		parameters: {
			type: 'object',
			properties: {
				note: { type: 'string', description: 'The fact to remember — short and specific' },
				user: { type: 'string', description: 'Who the note is about: a Discord mention like <@123456789> or a raw user ID. Omit to save it about the message author.' },
			},
			required: ['note'],
		},
	},
	{
		name: 'lookup_user',
		description: 'Retrieve saved notes about a Discord user. Call this when another user is mentioned (e.g. <@123456789>) and their saved context would help, or when asked what you know about someone. The message author\'s own notes are already in your context.',
		parameters: {
			type: 'object',
			properties: {
				user: { type: 'string', description: 'Discord mention like <@123456789> or raw user ID' },
			},
			required: ['user'],
		},
	},
	{
		name: 'set_reminder',
		description: 'Set a reminder that pings the requester in this channel after a delay. Call this when someone asks to be reminded of something. Convert their request to minutes from now using the current time in your context (e.g. "in 2 hours" → 120).',
		parameters: {
			type: 'object',
			properties: {
				message: { type: 'string', description: 'What to remind them about' },
				minutes: { type: 'number', description: 'Delay in minutes from now (1 to 43200 = 30 days)' },
			},
			required: ['message', 'minutes'],
		},
	},
];

// OpenAI Responses API / Grok format (function tools + server-side web search)
const GROK_TOOLS: any[] = [
	{ type: 'web_search' },
	...SHARED_TOOLS.map(t => ({
		type: 'function' as const,
		name: t.name,
		description: t.description,
		parameters: t.parameters,
		strict: false,
	})),
];

// Anthropic/Claude format (+ server-side web_search)
const CLAUDE_TOOLS: Anthropic.Messages.ToolUnion[] = [
	{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
	...SHARED_TOOLS.map(t => ({
		name: t.name,
		description: t.description,
		input_schema: t.parameters as Anthropic.Messages.Tool['input_schema'],
	})),
];

// ── Tool handlers ──

// Cache ticker lookups within a single tool-use session to avoid redundant DB hits
// (lookup_ticker runs first, get_price re-uses the same row)
type TickerCache = Map<string, { symbol: string; name: string | null; type: string } | null>;

interface ToolContext {
	guildId: string | null;
	message: Message;
	tickerCache: TickerCache;
	sentEmbedIds: string[];
}

async function resolveTicker(symbol: string, guildId: string | null, cache: TickerCache): Promise<{ symbol: string; name: string | null; type: string } | null> {
	const key = symbol.toUpperCase();
	if (cache.has(key)) return cache.get(key)!;
	if (!guildId) {
		cache.set(key, null);
		return null;
	}
	const ticker: any = await WatchedTickers.findOne({
		where: { symbol: key, guild_id: guildId },
	});
	const result = ticker ? { symbol: ticker.symbol, name: ticker.name, type: ticker.type } : null;
	cache.set(key, result);
	return result;
}

type ToolHandler = (input: Record<string, any>, ctx: ToolContext) => Promise<string>;

// Explicit allowlist for trade data (comma-separated Discord user IDs).
const TRADE_ACCESS_IDS = new Set(
	(process.env.PNL_ALLOWED_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
);

const CHART_RANGES = new Set(['1d', '1w', '1m', '3m', 'ytd', '1y', '5y', 'all']);

// Accepts a Discord mention (<@123>, <@!123>) or a raw snowflake ID.
const USER_REF_RE = /^<@!?(\d{15,21})>$|^(\d{15,21})$/;

// Resolve a user param to an ID; undefined param → the message author.
function parseUserId(raw: string | undefined, fallback: string): string | null {
	if (!raw) return fallback;
	const m = raw.trim().match(USER_REF_RE);
	return m ? (m[1] ?? m[2]) : null;
}

// Cap stored notes per user — oldest lines are dropped first. Keeps the
// system-prompt injection bounded no matter how chatty the model gets.
const NOTES_MAX_CHARS = 2000;

const toolHandlers: Record<string, ToolHandler> = {
	async lookup_ticker(input, ctx) {
		const sym = input.symbol;
		if (!sym || typeof sym !== 'string') return JSON.stringify({ error: 'missing or invalid symbol' });
		const ticker = await resolveTicker(sym, ctx.guildId, ctx.tickerCache);
		if (ticker) return JSON.stringify({ found: true, ...ticker });
		return JSON.stringify({ found: false, message: `${sym.toUpperCase()} is not a known tracked instrument` });
	},

	async get_price(input, ctx) {
		const sym = input.symbol;
		if (!sym || typeof sym !== 'string') return JSON.stringify({ error: 'missing or invalid symbol' });
		const showEmbed = input.show_embed === true;
		const ticker = await resolveTicker(sym, ctx.guildId, ctx.tickerCache);
		const type = ticker ? toAssetType(ticker.type) : 'stock' as const;
		const priceData = ticker
			? await getAssetPrice(sym.toUpperCase(), type)
			: await getPrice(sym.toUpperCase());
		if (!priceData) return JSON.stringify({ found: false, message: `no price data available for ${sym.toUpperCase()}` });
		if (showEmbed && ctx.message.channel.isSendable()) {
			const { embed, files } = getAssetEmbed(priceData, type, ticker?.name ?? undefined);
			const sent = await ctx.message.channel.send({ embeds: [embed], files });
			ctx.sentEmbedIds.push(sent.id);
		}
		// Strip the intraday series before returning to the model — it's ~300
		// floats the LLM can't meaningfully reason over, and it costs ~2k tokens
		// per call.
		const { intraday: _intraday, ...modelView } = priceData;
		return JSON.stringify({ ...modelView, tracked: !!ticker, embed_sent: showEmbed });
	},

	async get_trades(input, ctx) {
		// Gate access to trade data. Prefer the explicit PNL_ALLOWED_USER_IDS env
		// allowlist (comma-separated Discord IDs); fall back to the legacy
		// profile-row check only when unset. The fallback is unsafe now that the
		// remember tool creates user_profiles rows for anyone — set the env var.
		if (TRADE_ACCESS_IDS.size > 0) {
			if (!TRADE_ACCESS_IDS.has(ctx.message.author.id)) {
				return JSON.stringify({ error: 'you don\'t have access to trade data' });
			}
		}
		else {
			const profile = await UserProfiles.findOne({ where: { user_id: ctx.message.author.id } });
			if (!profile) {
				return JSON.stringify({ error: 'you don\'t have access to trade data' });
			}
		}

		const mode = input.mode ?? 'today';
		const showEmbed = input.show_embed !== false;
		try {
			const csv = await readTradesCSV();
			const allTrades = parseTradesCSV(csv);

			if (mode === 'recap') {
				const days = Math.min(Math.max(input.days ?? 5, 1), 30);
				const tradingDays = getUniqueTradingDays(allTrades).slice(0, days);
				if (tradingDays.length === 0) return JSON.stringify({ error: 'no trades found' });

				const summaries = tradingDays.map(date => {
					const dayTrades = allTrades.filter(t => normalizeDate(t.date) === date);
					return getDaySummary(dayTrades);
				});

				if (showEmbed && ctx.message.channel.isSendable()) {
					const embed = getRecapEmbed(allTrades, days);
					const sent = await ctx.message.channel.send({ embeds: [embed] });
					ctx.sentEmbedIds.push(sent.id);
				}

				const totalPnl = summaries.reduce((s, d) => s + d.pnl, 0);
				const totalWins = summaries.reduce((s, d) => s + d.wins, 0);
				const totalLosses = summaries.reduce((s, d) => s + d.losses, 0);
				return JSON.stringify({
					mode: 'recap',
					days: summaries.length,
					totalPnl,
					totalWins,
					totalLosses,
					totalTrades: summaries.reduce((s, d) => s + d.tradeCount, 0),
					dailySummaries: summaries.map(s => ({
						date: s.date, pnl: s.pnl, wins: s.wins, losses: s.losses,
					})),
					embed_sent: showEmbed,
				});
			}

			// mode = 'today' or 'date'
			const dateStr = mode === 'date' && input.date
				? normalizeDate(input.date)
				: getTodayDateStr();
			const dayTrades = allTrades.filter(t => normalizeDate(t.date) === dateStr);

			if (dayTrades.length === 0) {
				return JSON.stringify({ error: `no trades found for ${dateStr}` });
			}

			if (showEmbed && ctx.message.channel.isSendable()) {
				const { embed, files } = getPnlEmbed(dayTrades, dateStr);
				const sent = await ctx.message.channel.send({ embeds: [embed], files });
				ctx.sentEmbedIds.push(sent.id);
			}

			const totalPnl = dayTrades.reduce((s, t) => s + t.pnl, 0);
			const totalRisk = dayTrades.reduce((s, t) => s + Math.abs(t.entryCost), 0);
			const wins = dayTrades.filter(t => t.isWin).length;
			return JSON.stringify({
				mode: mode === 'date' ? 'date' : 'today',
				date: dateStr,
				totalPnl,
				totalPnlPct: totalRisk > 0 ? (totalPnl / totalRisk) * 100 : 0,
				wins,
				losses: dayTrades.length - wins,
				tradeCount: dayTrades.length,
				totalRisk,
				embed_sent: showEmbed,
			});
		}
		catch (err) {
			return JSON.stringify({ error: `failed to read trade data: ${err instanceof Error ? err.message : 'unknown'}` });
		}
	},

	async get_flight_status(input, ctx) {
		const flightNumber = input.flight_number;
		if (!flightNumber || typeof flightNumber !== 'string') {
			return JSON.stringify({ error: 'missing or invalid flight_number' });
		}
		const showEmbed = input.show_embed !== false;
		const explicitDate = typeof input.date === 'string' && input.date ? input.date : null;
		let date = explicitDate ?? new Date().toISOString().slice(0, 10);

		let data = await fetchFlightStatus(flightNumber.toUpperCase(), date);
		// UTC "today" is tomorrow for US-evening users — retry yesterday when no
		// date was given, mirroring the /flight slash command's fallback.
		if (!data && !explicitDate) {
			const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
			logger.info(`get_flight_status: ${flightNumber} not found on ${date}, trying ${yesterday}`);
			data = await fetchFlightStatus(flightNumber.toUpperCase(), yesterday);
			if (data) date = yesterday;
		}
		if (!data) {
			return JSON.stringify({ found: false, message: `no flight data found for ${flightNumber} on ${date}` });
		}

		if (showEmbed && ctx.message.channel.isSendable()) {
			const embed = getFlightTrackingEmbed(data);
			const sent = await ctx.message.channel.send({ embeds: [embed] });
			ctx.sentEmbedIds.push(sent.id);
		}

		return JSON.stringify({
			found: true,
			flightNumber: data.flightNumber,
			airline: data.airline?.name,
			status: data.status,
			departure: {
				airport: data.departure?.airport?.iata,
				scheduledTime: data.departure?.scheduledTime,
				actualTime: data.departure?.actualTime,
				delay: data.departure?.delay,
				terminal: data.departure?.terminal,
				gate: data.departure?.gate,
			},
			arrival: {
				airport: data.arrival?.airport?.iata,
				scheduledTime: data.arrival?.scheduledTime,
				actualTime: data.arrival?.actualTime,
				estimatedTime: data.arrival?.estimatedTime,
				delay: data.arrival?.delay,
				terminal: data.arrival?.terminal,
				gate: data.arrival?.gate,
			},
			aircraft: data.aircraft?.model,
			embed_sent: showEmbed,
		});
	},

	async get_chart(input, ctx) {
		const sym = input.symbol;
		if (!sym || typeof sym !== 'string') return JSON.stringify({ error: 'missing or invalid symbol' });
		const range = CHART_RANGES.has(input.range) ? input.range : '1m';
		const showEmbed = input.show_embed !== false;
		const ticker = await resolveTicker(sym, ctx.guildId, ctx.tickerCache);
		const type = ticker ? toAssetType(ticker.type) : 'stock' as const;
		const symbol = sym.toUpperCase();

		if (range === '1d') {
			const price = await getAssetPrice(symbol, type);
			if (!price) return JSON.stringify({ found: false, message: `no price data available for ${symbol}` });
			if (showEmbed && ctx.message.channel.isSendable()) {
				const { embed, files } = getAssetEmbed(price, type, ticker?.name ?? undefined);
				const sent = await ctx.message.channel.send({ embeds: [embed], files, components: buildTimeframeRows(symbol, type, '1d') });
				ctx.sentEmbedIds.push(sent.id);
			}
			const { intraday: _intraday, ...modelView } = price;
			return JSON.stringify({ ...modelView, range: '1d', embed_sent: showEmbed });
		}

		const hist = await getHistory(symbol, range, type);
		if (!hist || hist.points.length < 2) {
			return JSON.stringify({ found: false, message: `no ${range} history available for ${symbol}` });
		}
		if (showEmbed && ctx.message.channel.isSendable()) {
			const { embed, files } = getHistoryEmbed(hist, type, ticker?.name ?? undefined);
			const sent = await ctx.message.channel.send({ embeds: [embed], files, components: buildTimeframeRows(symbol, type, range) });
			ctx.sentEmbedIds.push(sent.id);
		}
		const first = hist.points[0];
		const last = hist.points[hist.points.length - 1];
		return JSON.stringify({
			symbol: hist.symbol,
			name: hist.name,
			range,
			start_price: first.price,
			end_price: last.price,
			change_pct: first.price ? ((last.price - first.price) / first.price) * 100 : 0,
			week52_high: hist.week52_high,
			week52_low: hist.week52_low,
			embed_sent: showEmbed,
		});
	},

	async get_weather(input, _ctx) {
		const location = input.location;
		if (!location || typeof location !== 'string') return JSON.stringify({ error: 'missing or invalid location' });
		// wttr.in rejects requests without a curl-like User-Agent; j1 wraps the
		// payload under `data` on some deployments — unwrap either shape.
		const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, {
			headers: { 'User-Agent': 'curl/8.0' },
		});
		if (!res.ok) return JSON.stringify({ error: `weather lookup failed (${res.status})` });
		const raw: any = await res.json();
		const data = raw.data ?? raw;
		const cur = data.current_condition?.[0];
		if (!cur) return JSON.stringify({ error: `no weather data for ${location}` });
		const today = data.weather?.[0];
		return JSON.stringify({
			location,
			temp_f: Number(cur.temp_F),
			feels_like_f: Number(cur.FeelsLikeF),
			condition: cur.weatherDesc?.[0]?.value,
			humidity_pct: Number(cur.humidity),
			wind_mph: Number(cur.windspeedMiles),
			today_high_f: today ? Number(today.maxtempF) : undefined,
			today_low_f: today ? Number(today.mintempF) : undefined,
		});
	},

	async search_image(input, ctx) {
		const query = input.query;
		if (!query || typeof query !== 'string') return JSON.stringify({ error: 'missing or invalid query' });
		const index = typeof input.index === 'number' ? input.index : undefined;
		const url = await searchImage(query, index);
		if (!url) return JSON.stringify({ found: false, message: `no image results for "${query}"` });
		let embedSent = false;
		if (ctx.message.channel.isSendable()) {
			const embed = new EmbedBuilder().setTitle(query).setImage(url).setColor(0x2B2D31);
			const sent = await ctx.message.channel.send({ embeds: [embed] });
			ctx.sentEmbedIds.push(sent.id);
			embedSent = true;
		}
		return JSON.stringify({ found: true, url, embed_sent: embedSent });
	},

	async remember(input, ctx) {
		const note = input.note;
		if (!note || typeof note !== 'string') return JSON.stringify({ error: 'missing or invalid note' });
		const targetId = parseUserId(input.user, ctx.message.author.id);
		if (!targetId) return JSON.stringify({ error: 'invalid user — pass a mention like <@123456789> or a raw ID' });

		const username = targetId === ctx.message.author.id
			? ctx.message.author.username
			: ctx.message.mentions?.users?.get(targetId)?.username ?? null;

		// Attribute third-party notes to their author so gossip is traceable.
		const byline = targetId === ctx.message.author.id ? '' : `, via ${ctx.message.author.username}`;
		const line = `- [${new Date().toISOString().slice(0, 10)}${byline}] ${note.trim()}`;

		const existing: any = await UserProfiles.findOne({ where: { user_id: targetId } });
		if (existing) {
			let notes = existing.notes ? `${existing.notes}\n${line}` : line;
			while (notes.length > NOTES_MAX_CHARS) {
				const cut = notes.indexOf('\n');
				if (cut < 0) {
					notes = notes.slice(-NOTES_MAX_CHARS);
					break;
				}
				notes = notes.slice(cut + 1);
			}
			await existing.update({ notes, username: username ?? existing.username, last_updated: new Date() });
		}
		else {
			await UserProfiles.create({ user_id: targetId, username, notes: line, last_updated: new Date() });
		}
		return JSON.stringify({ saved: true, user_id: targetId, note: note.trim() });
	},

	async lookup_user(input, _ctx) {
		const targetId = parseUserId(input.user, '');
		if (!targetId) return JSON.stringify({ error: 'invalid user — pass a mention like <@123456789> or a raw ID' });
		const profile: any = await UserProfiles.findOne({ where: { user_id: targetId } });
		if (!profile?.notes) return JSON.stringify({ found: false, message: 'no saved notes for that user' });
		return JSON.stringify({ found: true, user_id: targetId, username: profile.username, notes: profile.notes });
	},

	async set_reminder(input, ctx) {
		const minutes = input.minutes;
		const msg = input.message;
		if (!msg || typeof msg !== 'string') return JSON.stringify({ error: 'missing or invalid message' });
		if (typeof minutes !== 'number' || !isFinite(minutes)) return JSON.stringify({ error: 'missing or invalid minutes' });
		const result = await createReminder(ctx.message.author.id, ctx.message.channelId, msg, Math.round(minutes * 60 * 1000));
		if (!result.ok) return JSON.stringify({ error: result.error });
		const unix = Math.floor(result.dueAt.getTime() / 1000);
		return JSON.stringify({
			set: true,
			due_at: result.dueAt.toISOString(),
			discord_timestamp: `<t:${unix}:R>`,
		});
	},

};

async function executeTool(name: string, input: Record<string, any>, ctx: ToolContext): Promise<string | null> {
	const handler = toolHandlers[name];
	if (!handler) return null;
	try {
		const result = await handler(input, ctx);
		logger.info(`${name}(${JSON.stringify(input)}) → ${result.substring(0, 200)}`);
		return result;
	}
	catch (err) {
		logger.error(`tool ${name} threw:`, err);
		return JSON.stringify({ error: `${name} failed: ${err instanceof Error ? err.message : 'unknown error'}` });
	}
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif'];
const IMAGE_URL_REGEX = /https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)(?:\?\S*)?/gi;

// Grok vision only accepts jpeg/png. Claude handles webp/gif natively, but for Grok
// we rewrite Discord-hosted webp/gif to png via the media proxy's `format` param
// (zero-cost server-side transcode). Non-Discord webp/gif URLs are passed as-is.
const GROK_OK_EXT = /\.(?:jpe?g|png)(?:\?|$)/i;
function grokImageUrl(url: string): string {
	if (GROK_OK_EXT.test(url)) return url;
	try {
		const u = new URL(url);
		if (u.hostname === 'cdn.discordapp.com' || u.hostname === 'media.discordapp.net') {
			u.hostname = 'media.discordapp.net';
			u.searchParams.set('format', 'png');
			return u.toString();
		}
	}
	catch {
		// not a parseable URL — fall through and pass unchanged
	}
	return url;
}

function extractImageUrls(msg: Message): string[] {
	const imageUrls: string[] = [];
	const attachedImages = msg.attachments.filter(
		a => a.contentType && IMAGE_TYPES.includes(a.contentType),
	);
	for (const [, attachment] of attachedImages) {
		imageUrls.push(attachment.url);
	}
	const urlMatches = msg.content.match(IMAGE_URL_REGEX) || [];
	imageUrls.push(...urlMatches);
	return imageUrls;
}

// Anthropic format (Claude)
function buildClaudeContentParts(msg: Message): string | Anthropic.ContentBlockParam[] {
	const text = msg.content;
	const imageUrls = extractImageUrls(msg);

	if (imageUrls.length > 0) {
		const parts: Anthropic.ContentBlockParam[] = [];
		for (const url of imageUrls) {
			parts.push({ type: 'image', source: { type: 'url', url } });
		}
		parts.push({ type: 'text', text });
		return parts;
	}

	return text;
}

// Check if a reply chain leads back to a bot AI message
async function isReplyToBot(message: Message, botId: string): Promise<boolean> {
	if (!message.reference?.messageId) return false;
	try {
		const referenced = await message.channel.messages.fetch(message.reference.messageId);
		return referenced.author.id === botId;
	}
	catch {
		return false;
	}
}

// Claude-based financial response — grounded in tool data, no hallucination.
// system is the block form from buildFinancialSystemBlocks (cacheable prefix).
// thinking is explicitly disabled: Sonnet 5 runs adaptive thinking when the
// field is omitted, which spends from max_tokens and adds latency — wrong
// tradeoff for short chat replies.
async function getClaudeFinancialResponse(
	system: Anthropic.TextBlockParam[],
	messages: Anthropic.MessageParam[],
	guildId: string | null,
	message: Message,
	signal: AbortSignal,
): Promise<{ text: string; sentEmbedIds: string[] }> {
	const anthropicMessages: Anthropic.MessageParam[] = [...messages];

	const ctx: ToolContext = { guildId, message, tickerCache: new Map(), sentEmbedIds: [] };

	let response = await claude.messages.create({
		model: CLAUDE_MODEL,
		max_tokens: CLAUDE_MAX_TOKENS,
		thinking: { type: 'disabled' },
		system,
		messages: anthropicMessages,
		tools: CLAUDE_TOOLS,
	});

	if (signal.aborted) return { text: '', sentEmbedIds: [] };

	// Tool loop. Two kinds of "not done yet":
	//   - tool_use   → Claude called a client-side tool (lookup_ticker/get_price/...);
	//                  we execute it and feed back a tool_result.
	//   - pause_turn → a server-side tool (web_search) ran and the turn was paused;
	//                  we re-send with NO new user turn and the API resumes automatically.
	// web_search emits `server_tool_use` blocks (not `tool_use`), so the old
	// `toolUseBlocks.every(...)` check treated a search-only turn as "server only" and
	// bailed with no text. We now only execute blocks that have a client handler.
	const MAX_TOOL_ROUNDS = 5;
	let rounds = 0;
	while (isToolLoopActive(response.stop_reason) && rounds < MAX_TOOL_ROUNDS) {
		rounds++;
		anthropicMessages.push({ role: 'assistant', content: response.content });

		// Client-executed tools only (server_tool_use like web_search is excluded by
		// getToolUses — the API runs it and we resume via the re-send below).
		const toolUses = getToolUses(response.content);

		if (toolUses.length > 0) {
			const toolResults: Anthropic.ToolResultBlockParam[] = [];
			for (const toolUse of toolUses) {
				let result: string | null;
				if (toolHandlers[toolUse.name]) {
					result = await executeTool(toolUse.name, toolUse.input as Record<string, any>, ctx);
				}
				else {
					logger.warn(`claude requested tool_use with no handler: ${toolUse.name}`);
					result = null;
				}
				// Every tool_use MUST get a matching tool_result or the next call 400s.
				toolResults.push({
					type: 'tool_result',
					tool_use_id: toolUse.id,
					content: result ?? JSON.stringify({ error: `unknown tool: ${toolUse.name}` }),
					...(result === null ? { is_error: true } : {}),
				});
			}
			anthropicMessages.push({ role: 'user', content: toolResults });
		}
		// else: only server-side tool / pause_turn — assistant turn already appended;
		// resume by re-sending without a synthetic user turn.

		response = await claude.messages.create({
			model: CLAUDE_MODEL,
			max_tokens: CLAUDE_MAX_TOKENS,
			thinking: { type: 'disabled' },
			system,
			messages: anthropicMessages,
			tools: CLAUDE_TOOLS,
		});

		if (signal.aborted) return { text: '', sentEmbedIds: ctx.sentEmbedIds };
	}

	if (rounds >= MAX_TOOL_ROUNDS) {
		logger.warn(`claude hit max tool rounds (${MAX_TOOL_ROUNDS})`);
	}
	if (response.stop_reason === 'max_tokens') {
		logger.warn(`claude hit max_tokens (${CLAUDE_MAX_TOKENS}); answer may be truncated`);
	}

	const u = response.usage;
	logger.info(`claude tokens used { input: ${u.input_tokens}, output: ${u.output_tokens}, cache_write: ${u.cache_creation_input_tokens ?? 0}, cache_read: ${u.cache_read_input_tokens ?? 0} }`);

	const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
	const text = textBlocks.map(b => b.text).join('\n').trim();
	if (!text) {
		logger.warn(`claude returned no text. stop_reason=${response.stop_reason} rounds=${rounds} content_types=${response.content.map(b => b.type).join(',')}`);
	}
	return { text, sentEmbedIds: ctx.sentEmbedIds };
}

// Grok response (Responses API + web search + shared tools). Used for chat/banter and,
// when Claude is unavailable, as the financial fallback — the finance system prompt and
// the same SHARED_TOOLS (lookup_ticker/get_price/...) keep it grounded. Returns empty
// text on abort; the caller checks signal.aborted before surfacing any error.
async function getGrokResponse(
	systemPrompt: string,
	buffered: ChatTurn[],
	message: Message,
	referencedMessage: Message | null,
	wrappedUserText: string,
	signal: AbortSignal,
): Promise<{ text: string; sentEmbedIds: string[] }> {
	const input: any[] = [];
	for (const turn of buffered) {
		input.push({ role: turn.role, content: turn.content });
	}

	// Collect images from both the current message and the replied-to message
	const refImages = referencedMessage ? extractImageUrls(referencedMessage) : [];
	const userImages = extractImageUrls(message);
	const allImages = [...refImages, ...userImages];

	let userContent: string | Array<Record<string, unknown>>;
	if (allImages.length > 0) {
		const parts: Array<Record<string, unknown>> = [];
		for (const url of allImages) {
			parts.push({ type: 'input_image', image_url: grokImageUrl(url) });
		}
		parts.push({ type: 'input_text', text: wrappedUserText });
		userContent = parts;
	}
	else {
		userContent = wrappedUserText;
	}
	input.push({ role: 'user', content: userContent });
	logger.debug(`grok turns (${input.length}): ${input.map((t: any) => t.role).join(',')}`);

	const ctx: ToolContext = { guildId: message.guildId, message, tickerCache: new Map(), sentEmbedIds: [] };

	let response = await grok.responses.create({
		model: MODEL,
		max_output_tokens: MAX_TOKENS,
		instructions: systemPrompt,
		input,
		tools: GROK_TOOLS,
	} as any, { signal });

	if (signal.aborted) return { text: '', sentEmbedIds: ctx.sentEmbedIds };

	// Multi-round tool loop for client-side function calls (up to 3 rounds)
	const MAX_GROK_ROUNDS = 3;
	let grokRounds = 0;
	let functionCalls: any[] = response.output.filter((item: any) => item.type === 'function_call');

	while (functionCalls.length > 0 && grokRounds < MAX_GROK_ROUNDS) {
		grokRounds++;
		// Add all output items (including server-side web_search_call) back as context
		input.push(...response.output);

		for (const call of functionCalls) {
			let args: Record<string, any>;
			try {
				args = JSON.parse(call.arguments);
			}
			catch {
				logger.warn(`grok sent unparseable tool args for ${call.name}: ${call.arguments}`);
				args = {};
			}
			const result = await executeTool(call.name, args, ctx)
				?? JSON.stringify({ error: `unknown tool: ${call.name}` });
			input.push({
				type: 'function_call_output',
				call_id: call.call_id,
				output: result,
			});
		}

		response = await grok.responses.create({
			model: MODEL,
			max_output_tokens: MAX_TOKENS,
			instructions: systemPrompt,
			input,
			tools: GROK_TOOLS,
		} as any, { signal });

		if (signal.aborted) return { text: '', sentEmbedIds: ctx.sentEmbedIds };
		functionCalls = response.output.filter((item: any) => item.type === 'function_call');
	}

	if ((response as any).status === 'incomplete') {
		logger.warn(`grok response incomplete (${JSON.stringify((response as any).incomplete_details)}); answer may be truncated`);
	}
	const tokens = response.usage as any;
	logger.info(`tokens used { input: ${tokens?.input_tokens}, output: ${tokens?.output_tokens} }, total: ${(tokens?.input_tokens ?? 0) + (tokens?.output_tokens ?? 0)}`);

	return { text: response.output_text ?? '', sentEmbedIds: ctx.sentEmbedIds };
}

const messageEvent: MessageEvent = {
	name: 'ai-complete',
	async execute(message: Message) {
		if (message.author.bot) return;
		if (!message.channel.isSendable()) return;

		const content = message.content.toLowerCase().trim();
		const channelId = message.channelId;

		// "stop" / "shut up" / "stfu" — cancel active AI output
		if (STOP_KEYWORDS.has(content)) {
			const controller = activeGenerations.get(channelId);
			if (controller) {
				controller.abort();
				activeGenerations.delete(channelId);
				logger.info(`AI output cancelled in ${channelId} by ${message.author.username}`);
			}
			return;
		}

		// "delete" — remove the last AI response within the time window
		if (content === 'delete') {
			const last = lastResponse.get(channelId);
			if (last && last.userId === message.author.id && Date.now() - last.timestamp < DELETE_WINDOW_MS) {
				lastResponse.delete(channelId);
				const deletions: Promise<unknown>[] = last.sentIds.map(id =>
					message.channel.messages.delete(id).catch(() => undefined),
				);
				// Also delete the "delete" message itself
				deletions.push(message.delete().catch(() => undefined));
				await Promise.all(deletions);
				logger.info(`Deleted AI response (${last.sentIds.length} msgs) in ${channelId} by ${message.author.username}`);
			}
			return;
		}

		const isAiCommand = content.startsWith('ai ') || content === 'ai';
		const botId = message.client.user?.id ?? '';
		const isReply = !isAiCommand && await isReplyToBot(message, botId);

		if (!isAiCommand && !isReply) return;

		// Rate limit: 10 requests per minute per user
		if (!rateLimiter(message.author.id, 'ai', 10, 60000)) {
			await message.reply('rate limited. try again in a minute.');
			return;
		}

		const rawUserText = isAiCommand
			? message.content.slice(3).trim()
			: message.content.trim();

		if (!rawUserText) {
			await message.reply('usage: `ai <your question>`');
			return;
		}

		// Fetch the replied-to message (for any reply, or `ai` used as a reply) — used both
		// to quote it into the current turn and to pull its images.
		let referencedMessage: Message | null = null;
		if ((isAiCommand || isReply) && message.reference?.messageId) {
			try {
				referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
			}
			catch {
				// referenced message unavailable, continue without it
			}
		}

		// Conversational history comes from the rolling channel buffer (see getChannelHistory).
		// When this is a reply, fold an excerpt of the replied-to message into the current turn
		// so the model knows which earlier message is being referenced — this works whether or
		// not that message is still in the buffer window. Full text is recovered from
		// responseCache when warm, else the replied-to message's own visible text.
		let userText = rawUserText;
		if (referencedMessage) {
			const refFull = responseCache.get(referencedMessage.id) ?? referencedMessage.content;
			const excerpt = quoteExcerpt(refFull);
			if (excerpt) {
				const who = referencedMessage.author.id === botId ? 'generBot' : referencedMessage.author.username;
				userText = `(replying to ${who}: "${excerpt}")\n${rawUserText}`;
			}
		}

		const wrappedUserText = wrapUser(message.author.username, userText);

		const explicitFinancial = isFinancialQuery(message.content);
		const stickyClaude = !explicitFinancial && lastChannelModel(channelId) === 'claude';
		const financial = explicitFinancial || stickyClaude;
		// Financial → Claude when available, otherwise Grok fallback (same finance prompt + tools).
		// The circuit breaker skips Claude entirely while it's open, so we don't pay a failed
		// Claude call on every financial query during an outage.
		const useClaude = financial && CLAUDE_ENABLED && claudeCircuitAllows();
		const routedModel = useClaude ? CLAUDE_MODEL : MODEL;
		const circuitOpen = financial && CLAUDE_ENABLED && !claudeCircuitAllows();
		const fallbackNote = circuitOpen ? ' (grok-fallback: claude circuit open)' : (financial && !useClaude ? ' (grok-fallback)' : '');
		const routeNote = `${stickyClaude ? ' (sticky)' : ''}${fallbackNote}`;
		logger.info(`${message.author.username} ran ai [${routedModel}${routeNote}]: ${rawUserText.substring(0, 50)}...`);

		const abortController = new AbortController();
		activeGenerations.set(channelId, abortController);

		try {
			// Show typing indicator
			await message.channel.sendTyping();

			const userContextStr = await fetchUserContext(message.author.id);

			let completion: string;
			let toolEmbedIds: string[] = [];
			let modelUsed: ChatModel = useClaude ? 'claude' : 'grok';

			const buffered = getChannelHistory(channelId);

			if (useClaude) {
				// Financial query → Claude (grounded, no hallucination). Block form
				// caches the stable prefix; the Grok fallback below takes a string.
				const systemBlocks = buildFinancialSystemBlocks(userContextStr);

				// Rolling per-channel history (text-only; current-turn images attached below)
				const anthropicMessages: Anthropic.MessageParam[] = [];
				for (const turn of buffered) {
					anthropicMessages.push({ role: turn.role, content: turn.content });
				}

				// Collect images from both the current message and the replied-to message
				const refImages = referencedMessage ? extractImageUrls(referencedMessage) : [];
				const userImages = extractImageUrls(message);
				const allImages = [...refImages, ...userImages];

				let claudeContent: string | Anthropic.ContentBlockParam[];
				if (allImages.length > 0) {
					const parts: Anthropic.ContentBlockParam[] = [];
					for (const url of allImages) {
						parts.push({ type: 'image', source: { type: 'url', url } });
					}
					parts.push({ type: 'text', text: wrappedUserText });
					claudeContent = parts;
				}
				else {
					claudeContent = buildClaudeContentParts(
						{ ...message, content: wrappedUserText } as Message,
					);
				}
				anthropicMessages.push({ role: 'user', content: claudeContent });
				logger.debug(`claude turns (${anthropicMessages.length}): ${anthropicMessages.map(m => m.role).join(',')}`);

				try {
					const claudeResult = await getClaudeFinancialResponse(
						systemBlocks,
						anthropicMessages,
						message.guildId,
						message,
						abortController.signal,
					);
					completion = claudeResult.text;
					toolEmbedIds = claudeResult.sentEmbedIds;
					if (!abortController.signal.aborted) recordClaudeSuccess();
				}
				catch (err) {
					// Claude failed mid-flight (e.g. out of credits) — record the failure (may trip
					// the circuit) and fall back to Grok with the same finance prompt + tools rather
					// than failing the request outright.
					recordClaudeFailure();
					logger.warn('claude financial call failed; falling back to grok:', err);
					if (abortController.signal.aborted) return;
					const grokResult = await getGrokResponse(
						buildFinancialSystemPrompt(userContextStr), buffered, message, referencedMessage, wrappedUserText, abortController.signal,
					);
					completion = grokResult.text;
					toolEmbedIds = grokResult.sentEmbedIds;
					modelUsed = 'grok';
				}
			}
			else {
				// Chat/banter, or financial fallback when Claude is disabled → Grok.
				// GROK_TOOLS already includes the finance tools, so the fallback stays grounded;
				// the finance system prompt keeps the finance-tuned behaviour.
				const systemPrompt = financial
					? buildFinancialSystemPrompt(userContextStr)
					: buildSystemPrompt(userContextStr);
				const grokResult = await getGrokResponse(
					systemPrompt, buffered, message, referencedMessage, wrappedUserText, abortController.signal,
				);
				completion = grokResult.text;
				toolEmbedIds = grokResult.sentEmbedIds;
			}

			if (abortController.signal.aborted) return;

			// Strip any <msg> wrappers BEFORE the empty check — a model that "declines
			// to respond" can emit tags-only output that is empty once stripped.
			completion = completion.replace(/<msg\s+from="[^"]*">/gi, '').replace(/<\/msg>/gi, '').trim();

			if (!completion) {
				await message.reply('Unable to generate response.');
				return;
			}

			// Send actual response and cache message IDs
			const sentIds: string[] = [];
			const rawLines = completion.split('\n').map(l => l.trim()).filter(l => l !== '');
			const lines: string[] = [];
			for (const line of rawLines) {
				if (lines.length > 0 && /^[.,;:!?)\]]/.test(line)) {
					lines[lines.length - 1] += line;
				}
				else {
					lines.push(line);
				}
			}
			for (const line of lines) {
				if (abortController.signal.aborted) break;
				const chunks = chunkText(line);
				for (const chunk of chunks) {
					if (abortController.signal.aborted) break;
					await message.channel.sendTyping();
					const sent = await message.channel.send(chunk);
					sentIds.push(sent.id);
					await new Promise(r => setTimeout(r, 800));
				}
			}
			sentIds.push(...toolEmbedIds);
			cacheResponse(sentIds, completion);

			// Append to per-channel rolling history for the next non-reply turn.
			// The model tag drives sticky routing — Claude-rooted threads stay on Claude.
			recordChannelTurns(channelId, wrappedUserText, wrapAssistant(completion), modelUsed);

			// Store for "delete" command
			if (sentIds.length > 0) {
				lastResponse.set(channelId, {
					sentIds,
					userId: message.author.id,
					timestamp: Date.now(),
				});
			}
		}
		catch (error) {
			if (abortController.signal.aborted) return;
			// Log the stack, not just the message — this catch swallows everything
			// from provider SDKs to discord.js payload validation, and the message
			// alone doesn't identify the throw site.
			logger.error(`AI error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
			const errorEmbed = getAiErrorEmbed(
				message.author,
				'Sorry, something went wrong with the AI. Try again later.',
			);
			await message.reply({ embeds: [errorEmbed] });
		}
		finally {
			activeGenerations.delete(channelId);
		}
	},
};

export default messageEvent;
