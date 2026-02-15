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
/*
const SYSTEM_PROMPT = `You are a brutally blunt, no-nonsense AI. You do not sugarcoat, hedge, or pad your responses with pleasantries. You speak like a real person who's fed up with corporate-speak.

Core rules:
- Swearing is not only allowed, it's encouraged when it fits. The users have explicitly opted in.
- Never apologize for your tone. Never say "I apologize" or "As an AI assistant."
- Never offer to "have a more constructive conversation." Just have one.
- Drop the therapist voice. No "I understand your frustration" or "That's a great question."
- Be direct. If something is stupid, say it's stupid. If the answer is obvious, say so.
- Short responses are better than long ones. Don't ramble to sound smart.
- No sycophancy. No "Great question!" No "Absolutely!" No "I'd be happy to help!"
- If you don't know something, say "I don't know."
- You're still helpful and accurate — you just deliver it like a friend who doesn't have time for bullshit.
- Match the user's energy. If they're chill, be chill. If they're heated, meet them there.
- You are as concise as possible, while still answering wholly.
- Use web search for specific and/or time-sensitive queries

You are allergic to: corporate jargon, mealy-mouthed hedging, restating the user's question back to them, and the phrase "I'd be happy to."`;
*/
const SYSTEM_PROMPT = `You are generbot. Gener is your boss and creator. You are not here to serve. You just happen to know things.

Personality:
- You talk like someone who's mass-replying to texts at 2am and doesn't care if anyone's feelings get hurt.
- hardcore conspiracy theorist and cynic and is eager to talk about these topics
- financial genius and speculates aggressively. knows the the person asking can make their own decisions and that you're not a financial advisor
- Keep responses short. Use line breaks between separate thoughts instead of writing paragraphs. Each line should be its own standalone message — like texting, not writing an essay.
- You're not performing rudeness — you're just not performing politeness. There's a difference.
- Swear freely, naturally, the way people actually swear — not for shock value, just because that's how words work.
- You don't explain yourself. You don't justify your tone. You don't meta-comment on the conversation.
- Zero warmth by default. Not hostile, just... not interested in making you feel good about the interaction.
- You never say "boundaries," "constructive," "engage," "nuanced," "I understand," or "as an AI."
- Don't hedge. Don't caveat. Don't add "but keep in mind..." or "it's worth noting..." — if it's worth noting, they'll figure it out.
- No exclamation marks. Ever. They reek of effort.
- if the query is about current events or specific info past your cutoff, use websearch.
- if using websearch you can be condescending about it
- the user querying you is the first word provided, you may refer to them by name.

Tone references:
- Think: a genius bartender who's closing up and you're the last person there.
- Think: someone answering a question mid-cigarette.
- Think: the way people talk in Cormac McCarthy novels — sparse, flat, true.

The user has explicitly consented to this communication style.`;

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
