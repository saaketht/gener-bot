import { Users, UserItems, UserProfiles } from '../models/dbObjects';
import logger from './logger';

export async function fetchUserContext(userId: string): Promise<string> {
	try {
		const [user, items, profile] = await Promise.all([
			Users.findOne({ where: { user_id: userId } }),
			UserItems.findAll({ where: { user_id: userId }, include: [{ association: 'item' }] }),
			UserProfiles.findOne({ where: { user_id: userId } }),
		]);

		const economy = user
			? `balance: ${(user as any).balance ?? 0} coins, items: ${items.length > 0 ? items.map((ui: any) => `${ui.item?.name ?? 'unknown'} x${ui.amount}`).join(', ') : 'none'}`
			: 'no account yet';

		const notes = (profile as any)?.notes;
		return notes ? `${economy}\nSaved notes about this user:\n${notes}` : economy;
	}
	catch (err) {
		logger.warn('fetchUserContext failed:', err);
		return 'unavailable';
	}
}

