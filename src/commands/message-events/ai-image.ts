import OpenAI from 'openai';
import { Message } from 'discord.js';
import { MessageEvent } from '../../types';
import { rateLimiter } from '../../utils/rateLimiter';
import logger from '../../utils/logger';
import { getAiImageEmbed, getAiErrorEmbed } from '../../embeds/embeds';

const grok = new OpenAI({
	apiKey: process.env.GROK_API_KEY!,
	baseURL: 'https://api.x.ai/v1',
});

const messageEvent: MessageEvent = {
	name: 'ai-image',
	async execute(message: Message) {
		if (message.author.bot) return;
		if (!message.channel.isSendable()) return;

		const content = message.content.toLowerCase();
		if (!content.startsWith('ai-image ')) return;

		// Rate limit: 5 image requests per minute per user (images cost more)
		if (!rateLimiter(message.author.id, 'ai-image', 5, 60000)) {
			await message.reply('Slow down! Image generation is rate limited. Try again in a minute.');
			return;
		}

		const prompt = message.content.slice(9).trim();
		if (!prompt) {
			await message.reply('Usage: `ai-image <description of image>`');
			return;
		}

		logger.info(`${message.author.username} ran ai-image: ${prompt.substring(0, 50)}...`);

		try {
			// Show typing indicator
			await message.channel.sendTyping();

			const response = await grok.images.generate({
				model: 'grok-2-image',
				prompt: prompt,
				n: 1,
			});

			const imageUrl = response.data?.[0]?.url;
			if (imageUrl) {
				const embed = getAiImageEmbed(message.author, prompt, imageUrl);
				await message.reply({ embeds: [embed] });
				logger.info('Image generated successfully');
			}
			else {
				const errorEmbed = getAiErrorEmbed(message.author, 'Failed to generate image.');
				await message.reply({ embeds: [errorEmbed] });
			}
		}
		catch (error) {
			logger.error('Grok image API error:', error);
			const errorEmbed = getAiErrorEmbed(
				message.author,
				'Sorry, something went wrong generating the image. Try again later.',
			);
			await message.reply({ embeds: [errorEmbed] });
		}
	},
};

export default messageEvent;
