import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import OpenAI from 'openai';
import { Message } from 'discord.js';
import { MessageEvent } from '../../types';
import { rateLimiter } from '../../utils/rateLimiter';
import logger from '../../utils/logger';
import { getAiResponseEmbed, getAiErrorEmbed } from '../../embeds/embeds';

const grok = new OpenAI({
	apiKey: process.env.GROK_API_KEY!,
	baseURL: 'https://api.x.ai/v1',
});

const MODEL = 'grok-4.20-0309-non-reasoning';
const MAX_TOKENS = 2048;
const MAX_HISTORY = 20;
const DEFAULT_PROMPT = 'You are generbot, a concise and direct AI assistant.';

function loadPrompt(filename: string): string {
	const promptsDir = process.env.PROMPTS_DIR || join(resolve(__dirname, '..', '..', '..'), 'prompts');
	try {
		return readFileSync(join(promptsDir, filename), 'utf-8').trim();
	}
	catch {
		logger.warn(`Failed to load prompt from ${promptsDir}/${filename}, using default`);
		return DEFAULT_PROMPT;
	}
}

const SYSTEM_PROMPT = loadPrompt('generbot.txt');

function chunkText(text: string, maxLen = 2000): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < text.length; i += maxLen) {
		chunks.push(text.substring(i, i + maxLen));
	}
	return chunks;
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
			content = current.content;
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

const messageEvent: MessageEvent = {
	name: 'ai-complete',
	async execute(message: Message) {
		if (message.author.bot) return;
		if (!message.channel.isSendable()) return;

		const content = message.content.toLowerCase();
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

		logger.info(`${message.author.username} ran ai: ${textPrompt.substring(0, 50)}...`);

		try {
			// Show typing indicator
			await message.channel.sendTyping();

			// Build messages array — with history if replying
			let messages: Array<{ role: string; content: any }>;

			if (isReply) {
				const history = await walkReplyChain(message, botId);
				messages = [
					{ role: 'system', content: SYSTEM_PROMPT },
					...history,
				];
				logger.info(`Conversation history: ${history.length} messages`);
			}
			else {
				const userContent = buildContentParts(
					{ ...message, content: textPrompt } as Message,
				);
				messages = [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: userContent },
				];
			}

			const response = await grok.chat.completions.create({
				model: MODEL,
				max_tokens: MAX_TOKENS,
				messages: messages as any,
			});

			const completion = response.choices[0]?.message?.content ?? '';
			const reasoning = (response.choices[0]?.message as any)?.reasoning ?? '';

			if (!completion) {
				await message.reply('Unable to generate response.');
				return;
			}

			const tokens = response.usage;
			logger.info(`tokens used { input: ${tokens?.prompt_tokens}, output: ${tokens?.completion_tokens} }, total: ${(tokens?.prompt_tokens ?? 0) + (tokens?.completion_tokens ?? 0)}`);

			const _embed = getAiResponseEmbed(message.author, {
				model: MODEL,
				prompt: textPrompt,
				response: completion,
				inputTokens: tokens?.prompt_tokens ?? 0,
				outputTokens: tokens?.completion_tokens ?? 0,
				success: true,
			});

			// Send reasoning first, italicized
			if (reasoning) {
				const thinkingLines = reasoning.split('\n').filter((line: string) => line.trim() !== '');
				await message.channel.send('* ' + MODEL + ' thinking*');
				for (const _line of thinkingLines) {
					// TODO: send thinking chunks with delay
				}
			}

			// Send actual response
			const lines = completion.split('\n').filter(line => line.trim() !== '');
			for (const line of lines) {
				const chunks = chunkText(line);
				for (const chunk of chunks) {
					await message.channel.sendTyping();
					await message.channel.send(chunk);
					await new Promise(r => setTimeout(r, 800));
				}
			}
		}
		catch (error) {
			logger.error('Grok API error:', error);
			const errorEmbed = getAiErrorEmbed(
				message.author,
				'Sorry, something went wrong with the AI. Try again later.',
			);
			await message.reply({ embeds: [errorEmbed] });
		}
	},
};

export default messageEvent;
