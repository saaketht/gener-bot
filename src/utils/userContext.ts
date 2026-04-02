import OpenAI from 'openai';
import { Users, UserItems, UserProfiles } from '../models/dbObjects';
import logger from './logger';

const PROFILE_UPDATE_INTERVAL = 10;

const grok = new OpenAI({
	apiKey: process.env.GROK_API_KEY!,
	baseURL: 'https://api.x.ai/v1',
});

export async function fetchUserContext(userId: string): Promise<string> {
	try {
		const [user, items] = await Promise.all([
			Users.findOne({ where: { user_id: userId } }),
			UserItems.findAll({ where: { user_id: userId }, include: [{ association: 'item' }] }),
		]);

		if (!user) return 'no account yet';

		const balance = (user as any).balance ?? 0;
		const itemParts = items.map((ui: any) => `${ui.item?.name ?? 'unknown'} x${ui.amount}`);
		const itemStr = itemParts.length > 0 ? itemParts.join(', ') : 'none';

		return `balance: ${balance} coins, items: ${itemStr}`;
	}
	catch (err) {
		logger.warn('fetchUserContext failed:', err);
		return 'unavailable';
	}
}

export async function fetchUserProfile(userId: string): Promise<string | null> {
	try {
		const profile = await UserProfiles.findOne({ where: { user_id: userId } });
		return (profile as any)?.notes ?? null;
	}
	catch (err) {
		logger.warn('fetchUserProfile failed:', err);
		return null;
	}
}

export function updateUserProfile(userId: string, recentExchange: string, existingNotes: string | null): void {
	(async () => {
		try {
			const [profile] = await (UserProfiles as any).findOrCreate({
				where: { user_id: userId },
				defaults: { user_id: userId, interaction_count: 0, notes: null, last_updated: null },
			});

			const newCount = (profile.interaction_count ?? 0) + 1;
			profile.interaction_count = newCount;

			if (newCount % PROFILE_UPDATE_INTERVAL !== 0) {
				await profile.save();
				return;
			}

			// Every PROFILE_UPDATE_INTERVAL interactions, regenerate notes
			const response = await grok.chat.completions.create({
				model: 'grok-4.20-0309-non-reasoning',
				max_tokens: 150,
				messages: [
					{
						role: 'system',
						content: 'You are a memory assistant for a Discord bot. Given a recent chat excerpt and existing notes about a user, write 2-3 concise notes capturing their interests, personality, or patterns. Be direct and specific. No preamble, just the notes.',
					},
					{
						role: 'user',
						content: `Existing notes: ${existingNotes ?? 'none'}\n\nRecent exchange:\n${recentExchange}`,
					},
				],
			});

			const updatedNotes = response.choices[0]?.message?.content ?? null;
			if (updatedNotes) {
				profile.notes = updatedNotes;
				profile.last_updated = new Date();
			}

			await profile.save();
		}
		catch (err) {
			logger.warn('updateUserProfile failed (non-fatal):', err);
		}
	})();
}
