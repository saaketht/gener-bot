import { MessageEvent } from '../../types';
import { rateLimiter } from '../../utils/rateLimiter';
import logger from '../../utils/logger';
import {
	resolveOwnerList,
	resolveDbWatchlistView,
	addWatchlistItem,
	removeWatchlistItem,
	getListItems,
} from '../../utils/watchlist';

const USAGE = 'usage: `watchlist` (yours, or the guild\'s), `watchlist guild`, `watchlist add <sym> [guild]`, `watchlist remove <sym> [guild]`';

const messageEvent: MessageEvent = {
	name: 'watchlist',
	async execute(message) {
		if (message.author.bot) return;
		if (!message.guildId) return;
		const content = message.content.trim().toLowerCase();
		if (content !== 'watchlist' && !content.startsWith('watchlist ')) return;

		if (!rateLimiter(message.author.id, 'watchlist', 6, 30000)) {
			await message.reply('rate limited. try again in a bit.');
			return;
		}

		const args = message.content.trim().split(/\s+/).slice(1);
		const sub = args[0]?.toLowerCase();

		try {
			// Mutations: default to the caller's personal list; a trailing "guild"
			// targets the shared list. Anyone can curate the guild list for now —
			// the gate, if ever needed, lives in addWatchlistItem/removeWatchlistItem.
			if (sub === 'add' || sub === 'remove') {
				const symbol = args[1];
				if (!symbol) {
					await message.reply(USAGE);
					return;
				}
				const ownerKey = args[2]?.toLowerCase() === 'guild' ? '' : message.author.id;
				const result = sub === 'add'
					? await addWatchlistItem(message.guildId, ownerKey, symbol, message.author.id)
					: await removeWatchlistItem(message.guildId, ownerKey, symbol);
				if (!result.ok) {
					await message.reply(result.error);
					return;
				}
				const scope = ownerKey === '' ? 'guild list' : 'your list';
				await message.reply(sub === 'add'
					? `added ${result.symbol}${result.name ? ` (${result.name})` : ''} to ${scope}`
					: `removed ${result.symbol} from ${scope}`);
				return;
			}

			// Views: bare `watchlist` = personal-if-any else guild; `watchlist guild` forces guild.
			if (sub !== undefined && sub !== 'guild') {
				await message.reply(USAGE);
				return;
			}
			if ('sendTyping' in message.channel) await message.channel.sendTyping().catch(() => undefined);
			const ownerKey = sub === 'guild'
				? ''
				: (await resolveOwnerList(message.guildId, message.author.id)).ownerKey;

			const items = await getListItems(message.guildId, ownerKey);
			if (items.length === 0) {
				await message.reply(ownerKey === ''
					? 'guild watchlist is empty — `watchlist add <sym> guild`'
					: 'your watchlist is empty — `watchlist add <sym>`');
				return;
			}

			const payload = await resolveDbWatchlistView(message.guildId, ownerKey, '1d', 0);
			if (!payload) {
				await message.reply('couldn\'t fetch prices for the watchlist right now.');
				return;
			}
			await message.reply(payload);
		}
		catch (err) {
			logger.error('watchlist command failed:', err);
			await message.reply('watchlist failed. try again later.');
		}
	},
};

export default messageEvent;
