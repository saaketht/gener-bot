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
import { getPrice } from '../../utils/priceApi';

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

const FINANCIAL_SYSTEM_PROMPT = `You are generbot, a Discord bot. You've been routed a financial query — be factual and grounded.

Rules:
- Call lookup_ticker FIRST before saying anything about any symbol or instrument. No exceptions.
- For live data (price, volume, news, earnings), use web_search. Only state figures you retrieved — never invent numbers.
- If lookup_ticker returns found: false, say the symbol isn't tracked and stop. Don't describe what it might be, don't call it a shitcoin, token, coin, or anything else.
- 1-3 sentences. No markdown. No bullet points. Lowercase is fine.
- Sharp and direct. Not your financial advisor — but don't repeat that disclaimer every time.
- The first word of the user's message is their name. There is no need to start every message with it`;

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

const TOOLS: OpenAI.ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'lookup_ticker',
			description: 'Look up whether a symbol is a tracked financial instrument (stock, crypto, commodity, ETF). Call this BEFORE discussing any financial instrument to verify it exists.',
			parameters: {
				type: 'object',
				properties: {
					symbol: { type: 'string', description: 'The ticker symbol to look up, e.g. AAPL, BTC, SPY' },
				},
				required: ['symbol'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'lookup_user',
			description: 'Look up another user\'s profile and personality notes. Use when someone asks about, mentions, or references another person in the server — by name or by @mention.',
			parameters: {
				type: 'object',
				properties: {
					user: { type: 'string', description: 'Username or Discord user ID (from <@id> mentions) to look up' },
				},
				required: ['user'],
			},
		},
	},
];

const CLAUDE_TOOLS: Array<Anthropic.Tool | { type: string; name: string; max_uses: number }> = [
	{
		type: 'web_search_20250305',
		name: 'web_search',
		max_uses: 3,
	},
	{
		name: 'get_price',
		description: 'Get the current price and basic quote data for a stock, ETF, or crypto symbol. Use this for any question about current price, daily change, high/low, or price action. Prefer this over web_search for price data.',
		input_schema: {
			type: 'object' as const,
			properties: {
				symbol: { type: 'string', description: 'Ticker symbol, e.g. AAPL, BTC, SPY' },
			},
			required: ['symbol'],
		},
	},
	{
		name: 'lookup_ticker',
		description: 'Look up whether a symbol is a tracked financial instrument (stock, crypto, commodity, ETF). Always call this before stating anything about a financial instrument.',
		input_schema: {
			type: 'object' as const,
			properties: {
				symbol: { type: 'string', description: 'The ticker symbol to look up, e.g. AAPL, BTC, SPY' },
			},
			required: ['symbol'],
		},
	},
	{
		name: 'lookup_user',
		description: 'Look up another user\'s profile and personality notes. Use when someone asks about, mentions, or references another person in the server — by name or by @mention.',
		input_schema: {
			type: 'object' as const,
			properties: {
				user: { type: 'string', description: 'Username or Discord user ID (from <@id> mentions) to look up' },
			},
			required: ['user'],
		},
	},
];

async function lookupTicker(symbol: string, guildId: string | null): Promise<string> {
	if (!guildId) return JSON.stringify({ found: false, message: 'not a known financial instrument' });

	const ticker: any = await WatchedTickers.findOne({
		where: {
			symbol: symbol.toUpperCase(),
			guild_id: guildId,
		},
	});

	if (ticker) {
		return JSON.stringify({
			found: true,
			symbol: ticker.symbol,
			name: ticker.name,
			type: ticker.type,
		});
	}

	return JSON.stringify({ found: false, message: `${symbol.toUpperCase()} is not a known tracked instrument` });
}

async function lookupUser(userQuery: string, message: Message): Promise<string> {
	// Strip <@> mention syntax to get raw ID
	const idMatch = userQuery.match(/^<?@?(\d{17,20})>?$/);
	let profile: any = null;

	if (idMatch) {
		// Direct ID lookup
		profile = await UserProfiles.findOne({ where: { user_id: idMatch[1] } });
	}
	else {
		// Search by stored username first (case-insensitive)
		const allProfiles: any[] = await UserProfiles.findAll();
		profile = allProfiles.find(
			p => p.username && p.username.toLowerCase() === userQuery.toLowerCase(),
		);

		// Fallback to Discord API if not found in DB
		if (!profile && message.guild) {
			const members = await message.guild.members.fetch({ query: userQuery, limit: 1 });
			const member = members.first();
			if (member) {
				profile = await UserProfiles.findOne({ where: { user_id: member.id } });
			}
		}
	}

	if (!profile) {
		return JSON.stringify({ found: false, message: `no user found matching "${userQuery}"` });
	}

	if (!profile.notes) {
		return JSON.stringify({ found: true, user_id: profile.user_id, username: profile.username, notes: null, message: 'no profile notes yet for this user' });
	}

	return JSON.stringify({
		found: true,
		user_id: profile.user_id,
		username: profile.username,
		notes: profile.notes,
	});
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const IMAGE_URL_REGEX = /https?:\/\/\S+\.(?:jpg|jpeg|png)(?:\?\S*)?/gi;

function buildContentParts(msg: Message): string | Array<Record<string, unknown>> {
	const text = msg.content;
	const imageUrls: string[] = [];

	const attachedImages = msg.attachments.filter(
		a => a.contentType && IMAGE_TYPES.includes(a.contentType),
	);
	for (const [, attachment] of attachedImages) {
		imageUrls.push(attachment.url);
	}

	const urlMatches = text.match(IMAGE_URL_REGEX) || [];
	imageUrls.push(...urlMatches);

	if (imageUrls.length > 0) {
		const parts: Array<Record<string, unknown>> = [];
		for (const url of imageUrls) {
			parts.push({
				type: 'image_url',
				image_url: { url, detail: 'high' },
			});
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
			content = buildContentParts(stripped);
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
	userText: string,
	guildId: string | null,
	message: Message,
	signal: AbortSignal,
): Promise<string> {
	const anthropicMessages: Anthropic.MessageParam[] = [
		{ role: 'user', content: userText },
	];

	let response = await claude.messages.create({
		model: CLAUDE_MODEL,
		max_tokens: MAX_TOKENS,
		system: systemPrompt,
		messages: anthropicMessages,
		tools: CLAUDE_TOOLS as any,
	});

	if (signal.aborted) return '';

	// Handle tool use — one round-trip
	if (response.stop_reason === 'tool_use') {
		const toolUseBlocks = response.content.filter(
			(b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
		);

		anthropicMessages.push({ role: 'assistant', content: response.content });

		const toolResults: Anthropic.ToolResultBlockParam[] = [];
		for (const toolUse of toolUseBlocks) {
			let result: string;
			if (toolUse.name === 'get_price') {
				const sym = (toolUse.input as any).symbol as string;
				const priceData = await getPrice(sym);
				result = priceData
					? JSON.stringify(priceData)
					: JSON.stringify({ found: false, message: `no price data available for ${sym.toUpperCase()}` });
				logger.info(`claude get_price(${sym}) → ${result}`);
			}
			else if (toolUse.name === 'lookup_ticker') {
				result = await lookupTicker((toolUse.input as any).symbol, guildId);
				logger.info(`claude lookup_ticker(${(toolUse.input as any).symbol}) → ${result}`);
			}
			else if (toolUse.name === 'lookup_user') {
				result = await lookupUser((toolUse.input as any).user, message);
				logger.info(`claude lookup_user(${(toolUse.input as any).user}) → ${result}`);
			}
			else {
				result = JSON.stringify({ error: 'unknown tool' });
			}
			toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
		}

		anthropicMessages.push({ role: 'user', content: toolResults });

		response = await claude.messages.create({
			model: CLAUDE_MODEL,
			max_tokens: MAX_TOKENS,
			system: systemPrompt,
			messages: anthropicMessages,
			tools: CLAUDE_TOOLS as any,
		});

		if (signal.aborted) return '';
	}

	const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
	return textBlock?.text ?? '';
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

			if (financial) {
				// Financial query → Claude (grounded, no hallucination)
				const systemPrompt = buildFinancialSystemPrompt(userContextStr, profileNotes);
				completion = await getClaudeFinancialResponse(
					systemPrompt,
					textPrompt,
					message.guildId,
					message,
					abortController.signal,
				);
			}
			else {
				// Chat/banter → Grok
				const systemPrompt = buildSystemPrompt(userContextStr, profileNotes);

				// Build messages array — with history if replying
				let messages: Array<{ role: string; content: any }>;

				if (isReply) {
					const history = await walkReplyChain(message, botId);
					messages = [
						{ role: 'system', content: systemPrompt },
						...history,
					];
					logger.info(`Conversation history: ${history.length} messages`);
				}
				else {
					const userContent = buildContentParts(
						{ ...message, content: textPrompt } as Message,
					);
					messages = [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userContent },
					];
				}

				const guildId = message.guildId;

				let response = await grok.chat.completions.create({
					model: MODEL,
					max_tokens: MAX_TOKENS,
					messages: messages as any,
					tools: TOOLS,
				}, { signal: abortController.signal });

				if (abortController.signal.aborted) return;

				// Handle tool calls — one round-trip max
				const toolCalls = response.choices[0]?.message?.tool_calls;
				if (toolCalls && toolCalls.length > 0) {
					messages.push(response.choices[0].message as any);

					for (const toolCall of toolCalls) {
						const args = JSON.parse(toolCall.function.arguments);
						let result: string;

						if (toolCall.function.name === 'lookup_ticker') {
							result = await lookupTicker(args.symbol, guildId);
							logger.info(`lookup_ticker(${args.symbol}) → ${result}`);
						}
						else if (toolCall.function.name === 'lookup_user') {
							result = await lookupUser(args.user, message);
							logger.info(`lookup_user(${args.user}) → ${result}`);
						}
						else {
							result = JSON.stringify({ error: 'unknown tool' });
						}

						messages.push({
							role: 'tool',
							content: result,
							tool_call_id: toolCall.id,
						} as any);
					}

					response = await grok.chat.completions.create({
						model: MODEL,
						max_tokens: MAX_TOKENS,
						messages: messages as any,
						tools: TOOLS,
					}, { signal: abortController.signal });

					if (abortController.signal.aborted) return;
				}

				completion = response.choices[0]?.message?.content ?? '';

				const reasoning = (response.choices[0]?.message as any)?.reasoning ?? '';
				const tokens = response.usage;
				logger.info(`tokens used { input: ${tokens?.prompt_tokens}, output: ${tokens?.completion_tokens} }, total: ${(tokens?.prompt_tokens ?? 0) + (tokens?.completion_tokens ?? 0)}`);

				// Send reasoning first, italicized
				if (reasoning) {
					const thinkingLines = reasoning.split('\n').filter((line: string) => line.trim() !== '');
					await message.channel.send('* ' + MODEL + ' thinking*');
					for (const _line of thinkingLines) {
						// TODO: send thinking chunks with delay
					}
				}
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
