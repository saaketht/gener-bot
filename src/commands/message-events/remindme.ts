import { MessageEvent } from '../../types';
import { rateLimiter } from '../../utils/rateLimiter';
import { parseDuration, createReminder } from '../../utils/reminders';
import logger from '../../utils/logger';

const USAGE = 'usage: `remindme <duration> <message>` — e.g. `remindme 1h30m check the oven` (s/m/h/d/w)';

const messageEvent: MessageEvent = {
	name: 'remindme',
	async execute(message) {
		if (message.author.bot) return;
		if (!message.content.toLowerCase().startsWith('remindme ')) return;

		if (!rateLimiter(message.author.id, 'remindme', 5, 60000)) {
			await message.reply('rate limited. try again in a minute.');
			return;
		}

		const args = message.content.trim().split(/\s+/);
		const delayMs = parseDuration(args[1] ?? '');
		const text = args.slice(2).join(' ');

		if (delayMs === null || !text) {
			await message.reply(USAGE);
			return;
		}

		try {
			const result = await createReminder(message.author.id, message.channelId, text, delayMs);
			if (!result.ok) {
				await message.reply(result.error);
				return;
			}
			const unix = Math.floor(result.dueAt.getTime() / 1000);
			await message.reply(`⏰ got it — <t:${unix}:R> (<t:${unix}:f>)`);
		}
		catch (err) {
			logger.error('remindme failed:', err);
			await message.reply('failed to set reminder.');
		}
	},
};

export default messageEvent;
