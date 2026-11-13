import { Client } from 'discord.js';
import { MessageEvent } from '../../types';
import { BotState, dbReady } from '../../models/dbObjects';
import { buildLevelsMessage } from '../../embeds/levels-embeds';
import { etParts, LATE_MIN, POST_MIN, readMarketCalendar, shouldPostLevels } from '../../utils/marketLevels';
import logger from '../../utils/logger';

const STATE_KEY = 'levels_last_posted';
const TICK_MS = 60 * 1000;

// Weekday 09:58 ET market-levels post to LEVELS_CHANNEL_ID (unset → disabled).
// Ticks every minute; shouldPostLevels gates on the 09:58–10:15 window and the
// persisted posted-date. The date is claimed *before* sending, so a crash or
// restart mid-send can at worst skip a day, never double-post.
export function startLevelsWatcher(client: Client) {
	const channelId = process.env.LEVELS_CHANNEL_ID;
	if (!channelId) {
		logger.info('levels watcher disabled (LEVELS_CHANNEL_ID not set)');
		return;
	}

	let busy = false;
	const tick = async () => {
		const now = etParts(Date.now() / 1000);
		if (busy || now.minutes < POST_MIN || now.minutes > LATE_MIN) return;
		busy = true;
		try {
			await dbReady;
			const row: any = await BotState.findByPk(STATE_KEY);
			if (!shouldPostLevels(now, row?.value ?? null, await readMarketCalendar())) return;
			await BotState.upsert({ key: STATE_KEY, value: now.date });

			const msg = await buildLevelsMessage(undefined, { requireToday: true });
			if (!msg) {
				logger.info(`levels watcher: no regular-session bars for ${now.date}, skipping`);
				return;
			}
			const channel = await client.channels.fetch(channelId);
			if (!channel?.isSendable()) return;
			await channel.send(msg);
			logger.info(`levels watcher posted for ${now.date}`);
		}
		catch (err) {
			logger.warn('levels watcher tick failed:', err);
		}
		finally {
			busy = false;
		}
	};

	tick();
	setInterval(tick, TICK_MS);
	logger.info(`levels watcher enabled → channel ${channelId}, weekdays 09:58 ET`);
}

const messageEvent: MessageEvent = {
	name: 'levels',
	async execute(message) {
		if (message.author.bot) return;
		if (message.content.trim().toLowerCase() !== 'levels') return;
		try {
			if ('sendTyping' in message.channel) message.channel.sendTyping().catch(() => undefined);
			const msg = await buildLevelsMessage();
			if (msg) await message.reply(msg);
		}
		catch (err) {
			logger.error('levels handler error:', err);
			message.reply('Failed to build market levels.');
		}
	},
};

export default messageEvent;
