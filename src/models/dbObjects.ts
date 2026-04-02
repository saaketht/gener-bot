import { Sequelize } from 'sequelize';
import { currencyShop } from './CurrencyShop';
import { userItems } from './UserItems';
import { users } from './Users';
import { trackedFlights } from './TrackedFlights';
import { userProfiles } from './UserProfiles';

import { join } from 'path';

const sequelize = new Sequelize('database', 'username', 'password', {
	host: 'localhost',
	dialect: 'sqlite',
	logging: false,
	// resolve relative to project root, not cwd, so the DB survives deploys
	storage: join(__dirname, '..', '..', 'database.sqlite'),
});

const CurrencyShop = currencyShop(sequelize);
const UserItems = userItems(sequelize);
const Users = users(sequelize);
const TrackedFlights = trackedFlights(sequelize);
const UserProfiles = userProfiles(sequelize);
UserProfiles.sync(); // auto-create table if missing

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
};