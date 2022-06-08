"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserItems = exports.CurrencyShop = exports.Users = void 0;
const sequelize_1 = require("sequelize");
const CurrencyShop_1 = require("models/CurrencyShop");
const UserItems_1 = require("models/UserItems");
const Users_1 = require("models/Users");
const sequelize = new sequelize_1.Sequelize('database', 'username', 'password', {
    host: 'localhost',
    dialect: 'sqlite',
    logging: false,
    storage: 'database.sqlite',
});
const CurrencyShop = (0, CurrencyShop_1.currencyShop)(sequelize);
exports.CurrencyShop = CurrencyShop;
const UserItems = (0, UserItems_1.userItems)(sequelize);
exports.UserItems = UserItems;
const Users = (0, Users_1.users)(sequelize);
exports.Users = Users;
UserItems.belongsTo(CurrencyShop, { foreignKey: 'item_id', as: 'item' });
Reflect.defineProperty(Users.prototype, 'addItem', {
    value: async (item = {}) => {
        if (item && this) {
            const userItem = await UserItems.findOne({
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
