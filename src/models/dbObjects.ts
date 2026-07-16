import { Sequelize } from 'sequelize';
import { currencyShop } from './CurrencyShop';
import { userItems } from './UserItems';
import { users } from './Users';
import { trackedFlights } from './TrackedFlights';
import { userProfiles } from './UserProfiles';
import { channelHistory } from './ChannelHistory';
import { reminders } from './Reminders';
import { watchlistItems } from './WatchlistItems';
import { lookupStats } from './LookupStats';

import { join } from 'path';

const sequelize = new Sequelize('database', 'username', 'password', {
	host: 'localhost',
	dialect: 'sqlite',
	logging: false,
	// resolve to project root regardless of ts-node (src/models/) or compiled (built/src/models/)
	storage: join(__dirname, ...(__dirname.includes('built') ? ['..', '..', '..'] : ['..', '..']), 'database.sqlite'),
});

const CurrencyShop = currencyShop(sequelize);
const UserItems = userItems(sequelize);
const Users = users(sequelize);
const TrackedFlights = trackedFlights(sequelize);
const UserProfiles = userProfiles(sequelize);
const ChannelHistory = channelHistory(sequelize);
const Reminders = reminders(sequelize);
const WatchlistItems = watchlistItems(sequelize);
const LookupStats = lookupStats(sequelize);
// auto-create missing tables at startup. NOT { alter: true } — on SQLite that
// rebuilds every table via a copy-to-backup dance on each boot, which corrupts
// autoincrement PKs and crashes (see the tetris_scores incident). Add columns to
// existing tables via explicit one-shot migrations below instead.
// dbReady resolves once tables exist — await it before querying at module load.
const dbReady = sequelize.sync().then(async () => {
	// SQLite returns SQLITE_BUSY immediately when another process holds a write
	// lock (e.g. DB Browser with unwritten changes) — wait up to 5s instead.
	await sequelize.query('PRAGMA busy_timeout = 5000').catch(() => undefined);
	// One-shot cleanup: watched_tickers is fully replaced by watchlist_items.
	await sequelize.query('DROP TABLE IF EXISTS watched_tickers')
		.catch(err => console.warn('watched_tickers drop skipped:', err?.message ?? err));

	// One-shot seed: when the watchlist table is brand new, seed the guild list
	// from observed lookup frequency (top 8 as of Jul 2026 log analysis).
	try {
		const guildId = process.env.guildId;
		if (guildId && await WatchlistItems.count() === 0) {
			const SEED = ['SPCX', 'VOO', 'SPY', 'TXN', 'TTWO', 'NBIS', 'NVDA', 'QQQ'];
			await WatchlistItems.bulkCreate(SEED.map(symbol => ({
				guild_id: guildId, owner_id: '', symbol, type: 'stock', added_by: 'seed',
			})));
			console.log(`seeded guild watchlist with ${SEED.length} tickers`);
		}
	}
	catch (err: any) {
		console.warn('watchlist seed skipped:', err?.message ?? err);
	}
});

UserItems.belongsTo(CurrencyShop, { foreignKey: 'item_id', as: 'item' });

Reflect.defineProperty(Users.prototype, 'addItem', {
	value:async (item: any = {}) => {
		if (item && this) {
			const userItem:any = await UserItems.findOne({
				where: { userId: this?.['user_id'], item_id: item.id },
			}).catch(console.error);

			if (userItem) {
				userItem.amount += 1;
				return userItem.save();
			}

			return UserItems.create({ user_id: this?.['user_id'], item_id: item.id, amount: 1 });
		}
	},
});

Reflect.defineProperty(Users.prototype, 'getItems', {
	value: () => {
		return UserItems.findAll({
			where: { user_id: this?.['user_id'] },
			include: ['item'],
		});
	},
});

export {
	Users,
	CurrencyShop,
	UserItems,
	TrackedFlights,
	UserProfiles,
	ChannelHistory,
	Reminders,
	WatchlistItems,
	LookupStats,
	dbReady,
};