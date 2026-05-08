import { Users, UserItems } from '../models/dbObjects';
import logger from './logger';

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

