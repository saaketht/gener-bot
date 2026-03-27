import { Message } from 'discord.js';
import { MessageEvent } from '../../types';
import { rateLimiter } from '../../utils/rateLimiter';
import logger from '../../utils/logger';

const GROK_BASE = 'https://api.x.ai/v1';
const POLL_INTERVAL_MS = 5000;
// 5 minutes max at 5s intervals
const MAX_POLL_ATTEMPTS = 60;

const messageEvent: MessageEvent = {
	name: 'ai-video',
	async execute(message: Message) {
		if (message.author.bot) return;
		if (!message.channel.isSendable()) return;

		const content = message.content.toLowerCase();
		if (!content.startsWith('ai-video ')) return;

		// Rate limit: 1 video request per minute per user
		if (!rateLimiter(message.author.id, 'ai-video', 1, 60000)) {
			await message.reply('Slow down! Video generation is rate limited. Try again in a minute.');
			return;
		}

		const prompt = message.content.slice(9).trim();
		if (!prompt) {
			await message.reply('Usage: `ai-video <description of video>`');
			return;
		}

		logger.info(`${message.author.username} ran ai-video: ${prompt.substring(0, 50)}...`);

		try {
			// Show typing indicator — video generation takes a while
			if ('sendTyping' in message.channel) {
				await message.channel.sendTyping();
			}
			const typingInterval = setInterval(() => {
				if ('sendTyping' in message.channel) {
					message.channel.sendTyping().catch(() => undefined);
				}
			}, 8000);

			try {
				const headers = {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${process.env.GROK_API_KEY!}`,
				};

				// Submit generation request
				const submitRes = await fetch(`${GROK_BASE}/videos/generations`, {
					method: 'POST',
					headers,
					body: JSON.stringify({
						model: 'grok-imagine-video',
						prompt: prompt,
						duration: 5,
						aspect_ratio: '16:9',
						resolution: '720p',
					}),
				});

				if (!submitRes.ok) {
					const errorBody = await submitRes.text();
					throw new Error(`Grok video API returned ${submitRes.status}: ${errorBody}`);
				}

				const { request_id } = await submitRes.json();
				if (!request_id) {
					throw new Error('No request_id in video generation response');
				}

				logger.info(`Video generation submitted, request_id: ${request_id}`);

				// Poll for completion
				for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
					await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

					const pollRes = await fetch(`${GROK_BASE}/videos/${request_id}`, { headers });

					if (!pollRes.ok) {
						const errorBody = await pollRes.text();
						throw new Error(`Video poll returned ${pollRes.status}: ${errorBody}`);
					}

					const pollData = await pollRes.json();

					if (pollData.status === 'done') {
						const videoUrl = pollData.video?.url;
						if (videoUrl) {
							await message.reply(videoUrl);
							logger.info('Video generated successfully');
						}
						else {
							await message.reply('Failed to generate video.');
						}
						return;
					}

					if (pollData.status === 'failed' || pollData.status === 'error') {
						throw new Error(`Video generation failed: ${JSON.stringify(pollData)}`);
					}
				}

				await message.reply('Video generation timed out. Try again later.');
			}
			finally {
				clearInterval(typingInterval);
			}
		}
		catch (error) {
			logger.error('Grok video API error:', error);
			await message.reply('Sorry, something went wrong generating the video. Try again later.');
		}
	},
};

export default messageEvent;
