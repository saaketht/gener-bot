import { LookupStats } from '../models/dbObjects';

// Durable per-user asset-lookup counters (journald rotates; this doesn't).
// Powers frequency analysis and future watchlist-promotion suggestions.
// Fire-and-forget — never blocks or fails the lookup itself.
export function recordLookup(userId: string, symbol: string) {
	(async () => {
		const sym = symbol.toUpperCase();
		const row: any = await LookupStats.findOne({ where: { user_id: userId, symbol: sym } });
		if (row) await row.update({ count: row.count + 1, last_at: new Date() });
		else await LookupStats.create({ user_id: userId, symbol: sym, count: 1, last_at: new Date() });
	})().catch(() => undefined);
}
