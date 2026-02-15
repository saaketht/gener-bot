import { Sequelize } from 'sequelize';
import { currencyShop } from './CurrencyShop';
import { userItems } from './UserItems';
import { users } from './Users';

const sequelize = new Sequelize('database', 'username', 'password', {
	host: 'localhost',
	dialect: 'sqlite',
	logging: false,
	storage: 'database.sqlite',
});

const CurrencyShop = currencyShop(sequelize);
const UserItems = userItems(sequelize);
const Users = users(sequelize);

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
};