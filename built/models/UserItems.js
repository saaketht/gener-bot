"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userItems = void 0;
const sequelize_1 = require("sequelize");
const userItems = (sequelize) => {
    return sequelize.define('user_item', {
        user_id: sequelize_1.DataTypes.STRING,
        item_id: sequelize_1.DataTypes.INTEGER,
        amount: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
    }, {
        timestamps: false,
    });
};
exports.userItems = userItems;
