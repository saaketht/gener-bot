import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Message } from 'discord.js';
import { MessageEvent } from '../../types';
import { rateLimiter } from '../../utils/rateLimiter';
import logger from '../../utils/logger';
import { getAiResponseEmbed, getAiErrorEmbed } from '../../embeds/embeds';
import { COMMAND_MANIFEST } from '../../utils/commandManifest';
import { fetchUserContext, fetchUserProfile, updateUserProfile } from '../../utils/userContext';
import { WatchedTickers, UserProfiles } from '../../models/dbObjects';
import { getAssetPrice, getPrice, toAssetType } from '../../utils/priceApi';
import { readTradesCSV } from '../../utils/tradeData';
import { parseTradesCSV, normalizeDate, getTodayDateStr, getPnlEmbed } from '../../embeds/pnl-embeds';
import { getUniqueTradingDays, getDaySummary, getRecapEmbed } from '../../embeds/recap-embeds';
import { getAssetEmbed } from '../../embeds/asset-embeds';
import { fetchFlightStatus } from '../../utils/flightApi';
import { getFlightTrackingEmbed } from '../../embeds/flight-embeds';

const grok = new OpenAI({
	apiKey: process.env.GROK_API_KEY!,
	baseURL: 'https://api.x.ai/v1',
});

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const MODEL = 'grok-4.20-0309-non-reasoning';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 512;
const MAX_HISTORY = 20;
const DEFAULT_PROMPT = 'You are generbot, a concise and direct AI assistant.';

// Detect financial intent: $TICKER notation or explicit financial keywords
const FINANCIAL_TICKER_RE = /\$[A-Za-z]{1,6}\b/;
const FINANCIAL_KW_RE = /\b(price|option|beta|volume|market.?cap|earnings|dividend|ticker|stock|crypto|etf|put|call|implied.?vol|iv.?rank|p\/e|short.?interest|float|shares|bullish|bearish|expir|strike|hedge|portfolio)\b/i;

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

function buildSystemPrompt(userContextStr: string, profileNotes: string | null): string {
	let prompt = SYSTEM_PROMPT + '\n\nBot capabilities (mention casually when relevant, don\'t list them all):\n' + COMMAND_MANIFEST;
	if (profileNotes) prompt += '\n\nAbout this user:\n' + profileNotes;
	prompt += '\n\nUser data: ' + userContextStr;
	return prompt;
}

function buildFinancialSystemPrompt(userContextStr: string, profileNotes: string | null): string {
	let prompt = FINANCIAL_SYSTEM_PROMPT;
	if (profileNotes) prompt += '\n\nAbout this user:\n' + profileNotes;
	prompt += '\n\nUser data: ' + userContextStr;
	return prompt;
}

function chunkText(text: string, maxLen = 2000): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < text.length; i += maxLen) {
		chunks.push(text.substring(i, i + maxLen));
	}
	return chunks;
}

// Maps any bot message ID to the full completion text it was part of
const responseCache = new Map<string, string>();
const CACHE_MAX = 50;

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
		name: 'lookup_user',
		description: 'Look up another user\'s profile and personality notes. Use when someone asks about, mentions, or references another person in the server — by name or by @mention.',
		parameters: {
			type: 'object',
			properties: { user: { type: 'string', description: 'Username or Discord user ID (from <@id> mentions) to look up' } },
			required: ['user'],
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
	{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
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
			const embed = getAssetEmbed(priceData, type, ticker?.name ?? undefined);
			const sent = await ctx.message.channel.send({ embeds: [embed] });
			ctx.sentEmbedIds.push(sent.id);
		}
		return JSON.stringify({ ...priceData, tracked: !!ticker, embed_sent: showEmbed });
	},

	async get_trades(input, ctx) {
		// Gate access: only users with a profile in user_profiles can view trades
		const profile = await UserProfiles.findOne({ where: { user_id: ctx.message.author.id } });
		if (!profile) {
			return JSON.stringify({ error: 'you don\'t have access to trade data' });
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
				const embed = getPnlEmbed(dayTrades, dateStr);
				const sent = await ctx.message.channel.send({ embeds: [embed] });
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
		const today = new Date().toISOString().slice(0, 10);
		const date = input.date ?? today;

		const data = await fetchFlightStatus(flightNumber.toUpperCase(), date);
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

	async lookup_user(input, ctx) {
		const userQuery = input.user;
		if (!userQuery || typeof userQuery !== 'string') return JSON.stringify({ error: 'missing or invalid user' });
		const message = ctx.message;

		// Strip <@> mention syntax to get raw ID
		const idMatch = userQuery.match(/^<?@?(\d{17,20})>?$/);
		let profile: any = null;

		if (idMatch) {
			profile = await UserProfiles.findOne({ where: { user_id: idMatch[1] } });
		}
		else {
			const allProfiles: any[] = await UserProfiles.findAll();
			profile = allProfiles.find(
				p => p.username && p.username.toLowerCase() === userQuery.toLowerCase(),
			);
			if (!profile && message.guild) {
				const members = await message.guild.members.fetch({ query: userQuery, limit: 1 });
				const member = members.first();
				if (member) {
					profile = await UserProfiles.findOne({ where: { user_id: member.id } });
				}
			}
		}

		if (!profile) return JSON.stringify({ found: false, message: `no user found matching "${userQuery}"` });
		if (!profile.notes) return JSON.stringify({ found: true, user_id: profile.user_id, username: profile.username, notes: null, message: 'no profile notes yet for this user' });
		return JSON.stringify({ found: true, user_id: profile.user_id, username: profile.username, notes: profile.notes });
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

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const IMAGE_URL_REGEX = /https?:\/\/\S+\.(?:jpg|jpeg|png)(?:\?\S*)?/gi;

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

// Responses API format (Grok)
function buildGrokContentParts(msg: Message): string | Array<Record<string, unknown>> {
	const text = msg.content;
	const imageUrls = extractImageUrls(msg);

	if (imageUrls.length > 0) {
		const parts: Array<Record<string, unknown>> = [];
		for (const url of imageUrls) {
			parts.push({ type: 'input_image', image_url: url });
		}
		parts.push({ type: 'input_text', text });
		return parts;
	}

	return text;
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

// Walk the reply chain to build conversation history
async function walkReplyChain(message: Message, botId: string): Promise<Array<{ role: string; content: any }>> {
	const history: Array<{ role: string; content: any }> = [];
	let current: Message | null = message;

	while (current && history.length < MAX_HISTORY) {
		const isBotMsg = current.author.id === botId;
		const role = isBotMsg ? 'assistant' : 'user';
		let content: any;

		if (isBotMsg) {
			// Use cached full response if available, otherwise just this message
			content = responseCache.get(current.id) ?? current.content;
		}
		else {
			// Strip "ai " prefix if present
			const text = current.content.replace(/^ai\s+/i, '');
			const stripped = { ...current, content: current.author.username + ': ' + text } as Message;
			content = buildGrokContentParts(stripped);
		}

		history.unshift({ role, content });

		// Follow the reply reference
		if (current.reference?.messageId) {
			try {
				current = await current.channel.messages.fetch(current.reference.messageId);
			}
			catch {
				break;
			}
		}
		else {
			break;
		}
	}

	// Merge consecutive same-role messages (bot sends multiple messages per response)
	const merged: Array<{ role: string; content: any }> = [];
	for (const msg of history) {
		const last = merged[merged.length - 1];
		if (last && last.role === msg.role && typeof last.content === 'string' && typeof msg.content === 'string') {
			last.content += '\n' + msg.content;
		}
		else {
			merged.push(msg);
		}
	}

	return merged;
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

// Claude-based financial response — grounded in tool data, no hallucination
async function getClaudeFinancialResponse(
	systemPrompt: string,
	userContent: string | Anthropic.ContentBlockParam[],
	guildId: string | null,
	message: Message,
	signal: AbortSignal,
): Promise<{ text: string; sentEmbedIds: string[] }> {
	const anthropicMessages: Anthropic.MessageParam[] = [
		{ role: 'user', content: userContent },
	];

	const ctx: ToolContext = { guildId, message, tickerCache: new Map(), sentEmbedIds: [] };

	let response = await claude.messages.create({
		model: CLAUDE_MODEL,
		max_tokens: MAX_TOKENS,
		system: systemPrompt,
		messages: anthropicMessages,
		tools: CLAUDE_TOOLS,
	});

	if (signal.aborted) return { text: '', sentEmbedIds: [] };

	// Tool use loop — Claude may chain multiple tool calls (e.g. lookup_ticker → get_price → web_search)
	const MAX_TOOL_ROUNDS = 5;
	let rounds = 0;
	while (response.stop_reason === 'tool_use' && rounds < MAX_TOOL_ROUNDS) {
		rounds++;
		const toolUseBlocks = response.content.filter(
			(b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
		);

		anthropicMessages.push({ role: 'assistant', content: response.content });

		const serverOnly = toolUseBlocks.every(b => !toolHandlers[b.name]);
		if (serverOnly) {
			logger.info(`claude round ${rounds}: only server-side tools (${toolUseBlocks.map(b => b.name).join(', ')}), continuing`);
			break;
		}

		const toolResults: Anthropic.ToolResultBlockParam[] = [];
		for (const toolUse of toolUseBlocks) {
			const result = await executeTool(toolUse.name, toolUse.input as Record<string, any>, ctx);
			if (result === null) continue;
			toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
		}

		if (toolResults.length === 0) break;
		anthropicMessages.push({ role: 'user', content: toolResults });

		response = await claude.messages.create({
			model: CLAUDE_MODEL,
			max_tokens: MAX_TOKENS,
			system: systemPrompt,
			messages: anthropicMessages,
			tools: CLAUDE_TOOLS,
		});

		if (signal.aborted) return { text: '', sentEmbedIds: ctx.sentEmbedIds };
	}

	if (rounds >= MAX_TOOL_ROUNDS) {
		logger.warn(`claude hit max tool rounds (${MAX_TOOL_ROUNDS})`);
	}

	logger.info(`claude tokens used { input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens} }, total: ${response.usage.input_tokens + response.usage.output_tokens}`);

	const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
	const text = textBlocks.map(b => b.text).join('\n').trim();
	if (!text) {
		logger.warn(`claude returned no text. stop_reason=${response.stop_reason} rounds=${rounds} content_types=${response.content.map(b => b.type).join(',')}`);
	}
	return { text, sentEmbedIds: ctx.sentEmbedIds };
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

		const textPrompt = isAiCommand
			? message.author.username + ': ' + message.content.slice(3).trim()
			: message.author.username + ': ' + message.content.trim();

		if (!textPrompt) {
			await message.reply('usage: `ai <your question>`');
			return;
		}

		// Pull images from the replied-to message when using `ai` as a reply
		let referencedMessage: Message | null = null;
		if (isAiCommand && message.reference?.messageId) {
			try {
				referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
			}
			catch {
				// referenced message unavailable, continue without it
			}
		}

		const financial = isFinancialQuery(message.content);
		const routedModel = financial ? CLAUDE_MODEL : MODEL;
		logger.info(`${message.author.username} ran ai [${routedModel}]: ${textPrompt.substring(0, 50)}...`);

		const abortController = new AbortController();
		activeGenerations.set(channelId, abortController);

		try {
			// Show typing indicator
			await message.channel.sendTyping();

			// Fetch user context and profile in parallel for enriched system prompt
			const [userContextStr, profileNotes] = await Promise.all([
				fetchUserContext(message.author.id),
				fetchUserProfile(message.author.id),
			]);

			let completion: string;
			let toolEmbedIds: string[] = [];

			if (financial) {
				// Financial query → Claude (grounded, no hallucination)
				const systemPrompt = buildFinancialSystemPrompt(userContextStr, profileNotes);
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
					parts.push({ type: 'text', text: textPrompt });
					claudeContent = parts;
				}
				else {
					claudeContent = buildClaudeContentParts(
						{ ...message, content: textPrompt } as Message,
					);
				}
				const claudeResult = await getClaudeFinancialResponse(
					systemPrompt,
					claudeContent,
					message.guildId,
					message,
					abortController.signal,
				);
				completion = claudeResult.text;
				toolEmbedIds = claudeResult.sentEmbedIds;
			}
			else {
				// Chat/banter → Grok (Responses API with web search)
				const systemPrompt = buildSystemPrompt(userContextStr, profileNotes);

				// Build input array for Responses API
				let input: any[];

				if (isReply) {
					const history = await walkReplyChain(message, botId);
					input = history.map(h => ({
						role: h.role,
						content: h.content,
					}));
					logger.info(`Conversation history: ${history.length} messages`);
				}
				else {
					// Collect images from both the current message and the replied-to message
					const refImages = referencedMessage ? extractImageUrls(referencedMessage) : [];
					const userImages = extractImageUrls(message);
					const allImages = [...refImages, ...userImages];

					let userContent: string | Array<Record<string, unknown>>;
					if (allImages.length > 0) {
						const parts: Array<Record<string, unknown>> = [];
						for (const url of allImages) {
							parts.push({ type: 'input_image', image_url: url });
						}
						parts.push({ type: 'input_text', text: textPrompt });
						userContent = parts;
					}
					else {
						userContent = textPrompt;
					}

					input = [
						{ role: 'user', content: userContent },
					];
				}

				const guildId = message.guildId;
				const ctx: ToolContext = { guildId, message, tickerCache: new Map(), sentEmbedIds: [] };

				let response = await grok.responses.create({
					model: MODEL,
					max_output_tokens: MAX_TOKENS,
					instructions: systemPrompt,
					input,
					tools: GROK_TOOLS,
				} as any, { signal: abortController.signal });

				if (abortController.signal.aborted) return;

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
					} as any, { signal: abortController.signal });

					if (abortController.signal.aborted) return;
					functionCalls = response.output.filter((item: any) => item.type === 'function_call');
				}

				completion = response.output_text ?? '';
				toolEmbedIds = ctx.sentEmbedIds;

				const tokens = response.usage as any;
				logger.info(`tokens used { input: ${tokens?.input_tokens}, output: ${tokens?.output_tokens} }, total: ${(tokens?.input_tokens ?? 0) + (tokens?.output_tokens ?? 0)}`);
			}

			if (!completion) {
				await message.reply('Unable to generate response.');
				return;
			}

			const _embed = getAiResponseEmbed(message.author, {
				model: routedModel,
				prompt: textPrompt,
				response: completion,
				inputTokens: 0,
				outputTokens: 0,
				success: true,
			});

			// Send actual response and cache message IDs
			const sentIds: string[] = [];
			const lines = completion.split('\n').filter(line => line.trim() !== '');
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

			// Async profile update — fire and forget, never blocks response
			updateUserProfile(message.author.id, message.author.username, textPrompt + '\n' + completion, profileNotes);

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
			logger.error('AI API error:', error);
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
