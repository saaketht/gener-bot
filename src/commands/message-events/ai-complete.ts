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

const MODEL = 'grok-3-mini';
const MAX_TOKENS = 2048;
const DEFAULT_PROMPT = 'You are generbot, a concise and direct AI assistant.';
const SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || DEFAULT_PROMPT;

function chunkText(text: string, maxLen = 2000): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < text.length; i += maxLen) {
		chunks.push(text.substring(i, i + maxLen));
	}
	return chunks;
}

const messageEvent: MessageEvent = {
	name: 'ai-complete',
	async execute(message: Message) {
		if (message.author.bot) return;
		if (!message.channel.isSendable()) return;

		const content = message.content.toLowerCase();
		if (!content.startsWith('ai ') && content !== 'ai') return;

		// Rate limit: 10 requests per minute per user
		if (!rateLimiter(message.author.id, 'ai', 10, 60000)) {
			await message.reply('rate limited. try again in a minute.');
			return;
		}

		const prompt = message.author.username + ': ' + message.content.slice(3).trim();
		if (!prompt) {
			await message.reply('usage: `ai <your question>`');
			return;
		}

		logger.info(`${message.author.username} ran ai: ${prompt.substring(0, 50)}...`);

		try {
			// Show typing indicator
			await message.channel.sendTyping();

			const response = await grok.chat.completions.create({
				model: MODEL,
				max_tokens: MAX_TOKENS,
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: prompt },
				],
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
				prompt: prompt,
				response: completion,
				inputTokens: tokens?.prompt_tokens ?? 0,
				outputTokens: tokens?.completion_tokens ?? 0,
				success: true,
			});

			// Send reasoning first, italicized
			if (reasoning) {
				const thinkingLines = reasoning.split('\n').filter((line: string) => line.trim() !== '');
				await message.channel.send('*thinking*');
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
