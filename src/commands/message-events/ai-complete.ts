import Anthropic from '@anthropic-ai/sdk';
import { Message } from 'discord.js';
import { MessageEvent } from '../../types';
import { rateLimiter } from '../../utils/rateLimiter';
import logger from '../../utils/logger';
import { getAiResponseEmbed, getAiErrorEmbed } from '../../embeds/embeds';
import { log } from 'console';

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-haiku-4-5-20251001';
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

			const response = await anthropic.messages.create({
				model: MODEL,
				max_tokens: MAX_TOKENS,
				thinking: {
					type: "enabled",
					budget_tokens: 1024
				},
				system: SYSTEM_PROMPT,
				messages: [
					{ role: 'user', content: prompt },
				],
			});

			const thinkingBlocks = response.content
			.filter(block => block.type === 'thinking')
			.map(block => (block as any).thinking)
			.join('\n');

			const completion = response.content
				.filter(block => block.type === 'text')
				.map(block => (block as any).text)
				.join('\n');

			if (!completion) {
				await message.reply('Unable to generate response.');
				return;
			}


			const tokens = response.usage;
			logger.info(`tokens used { input: ${tokens.input_tokens}, output: ${tokens.output_tokens} }, total: ${tokens.input_tokens + tokens.output_tokens}`);

			const embed = getAiResponseEmbed(message.author, {
				model: MODEL,
				prompt: prompt,
				response: completion,
				inputTokens: tokens.input_tokens,
				outputTokens: tokens.output_tokens,
				success: true,
			});

			//await message.reply({ embeds: [embed] }); // looks kinda lame tbh
			// Send thinking first, italicized
			if (thinkingBlocks) {
				const thinkingLines = thinkingBlocks.split('\n').filter(line => line.trim() !== '');
				await message.channel.send('*thinking*');
				for (const line of thinkingLines) {
					const chunks = chunkText(`*${line}*`);
					for (const chunk of chunks) {
						//await message.channel.sendTyping();
						//await message.channel.send(chunk);
						//await new Promise(r => setTimeout(r, 800));
					}
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
			logger.error('Claude API error:', error);
			const errorEmbed = getAiErrorEmbed(
				message.author,
				'Sorry, something went wrong with the AI. Try again later.',
			);
			await message.reply({ embeds: [errorEmbed] });
		}
	},
};

export default messageEvent;
