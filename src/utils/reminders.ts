import { Client } from 'discord.js';
import { Op } from 'sequelize';
import { Reminders } from '../models/dbObjects';
import logger from './logger';

const UNIT_MS: Record<string, number> = {
	s: 1000,
	m: 60 * 1000,
	h: 60 * 60 * 1000,
	d: 24 * 60 * 60 * 1000,
	w: 7 * 24 * 60 * 60 * 1000,
};

export const MIN_DELAY_MS = 10 * 1000;
export const MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_MESSAGE_LEN = 500;
export const MAX_PENDING_PER_USER = 10;

// Parse compound durations like "10m", "1h30m", "2d12h". The whole string must
// be consumed by unit tokens — "10 minutes" or "1hr" returns null.
export function parseDuration(raw: string): number | null {
	const s = raw.toLowerCase().trim();
	let total = 0;
	let consumed = '';
	for (const m of s.matchAll(/(\d+)([smhdw])/g)) {
		total += parseInt(m[1]) * UNIT_MS[m[2]];
		consumed += m[0];
	}
	if (consumed !== s || total <= 0) return null;
	return total;
}

export type CreateResult =
	| { ok: true; dueAt: Date }
	| { ok: false; error: string };

// Shared by the remindme message event and the AI set_reminder tool.
export async function createReminder(userId: string, channelId: string, message: string, delayMs: number): Promise<CreateResult> {
	if (delayMs < MIN_DELAY_MS) return { ok: false, error: 'minimum delay is 10 seconds' };
	if (delayMs > MAX_DELAY_MS) return { ok: false, error: 'maximum delay is 30 days' };
	const text = message.trim().slice(0, MAX_MESSAGE_LEN);
	if (!text) return { ok: false, error: 'reminder message is empty' };

	const pending = await Reminders.count({ where: { user_id: userId } });
	if (pending >= MAX_PENDING_PER_USER) {
		return { ok: false, error: `you already have ${MAX_PENDING_PER_USER} pending reminders` };
	}

	const dueAt = new Date(Date.now() + delayMs);
	await Reminders.create({ user_id: userId, channel_id: channelId, message: text, due_at: dueAt });
	return { ok: true, dueAt };
}

const POLL_MS = 30 * 1000;

// Single lightweight poller — fires anything past due (including reminders that
// came due while the bot was down) and deletes rows after one delivery attempt,
// so a deleted channel can't wedge the queue.
export function startReminderLoop(client: Client) {
	setInterval(async () => {
		try {
			const due: any[] = await Reminders.findAll({ where: { due_at: { [Op.lte]: new Date() } } });
			for (const r of due) {
				try {
					const channel = await client.channels.fetch(r.channel_id);
					if (channel?.isSendable()) {
						await channel.send(`⏰ <@${r.user_id}> ${r.message}`);
					}
				}
				catch (err) {
					logger.warn(`reminder ${r.id} delivery failed:`, err);
				}
				await r.destroy();
			}
		}
		catch (err) {
			logger.warn('reminder poll failed:', err);
		}
	}, POLL_MS);
	logger.info('reminder loop started');
}
