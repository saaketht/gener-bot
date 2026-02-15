import logger from './logger';

const cache = new Map<string, number[]>();

/**
 * Rate limits commands per user
 * @param userId - Discord user ID
 * @param commandName - Name of the command being rate limited
 * @param limit - Max invocations allowed within timeWindow
 * @param timeWindow - Time window in milliseconds
 * @returns true if command allowed, false if rate limited
 */
export const rateLimiter = (
	userId: string,
	commandName: string,
	limit: number,
	timeWindow: number,
): boolean => {
	const key = `${userId}-${commandName}`;
	const now = Date.now();
	let userHistory = cache.get(key) || [];

	userHistory = userHistory.filter(timestamp => now - timestamp < timeWindow);

	if (userHistory.length >= limit) {
		logger.warn(`Rate limit exceeded for user ${userId} on command ${commandName}`);
		return false;
	}

	userHistory.push(now);
	cache.set(key, userHistory);
	return true;
};

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;
// 1 hour max age for cache entries
const DEFAULT_MAX_AGE = 60 * 60 * 1000;

setInterval(() => {
	const now = Date.now();
	for (const [key, timestamps] of cache) {
		const valid = timestamps.filter(t => now - t < DEFAULT_MAX_AGE);
		if (valid.length === 0) {
			cache.delete(key);
		}
		else {
			cache.set(key, valid);
		}
	}
}, CLEANUP_INTERVAL);
