import { Sequelize } from 'sequelize';
import { currencyShop } from './CurrencyShop';
import { userItems } from './UserItems';
import { users } from './Users';
import { trackedFlights } from './TrackedFlights';
import { userProfiles } from './UserProfiles';
import { watchedTickers } from './WatchedTickers';
import { channelHistory } from './ChannelHistory';

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
const WatchedTickers = watchedTickers(sequelize);
const ChannelHistory = channelHistory(sequelize);
// auto-create missing tables at startup. NOT { alter: true } — on SQLite that
// rebuilds every table via a copy-to-backup dance on each boot, which corrupts
// autoincrement PKs and crashes (see the tetris_scores incident). Add columns to
// existing tables via explicit one-shot migrations below instead.
// dbReady resolves once tables exist — await it before querying at module load.
const dbReady = sequelize.sync().then(() => {
	// One-shot migration: collapse legacy 'etf' rows into 'stock' (idempotent).
	WatchedTickers.update({ type: 'stock' }, { where: { type: 'etf' } });
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
	WatchedTickers,
	ChannelHistory,
	dbReady,
};