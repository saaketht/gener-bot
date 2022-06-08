"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.currencyShop = void 0;
const sequelize_1 = require("sequelize");
const currencyShop = (sequelize) => {
    return sequelize.define('currency_shop', {
        name: {
            type: sequelize_1.DataTypes.STRING,
            unique: true,
        },
        cost: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
        },
    }, {
        timestamps: false,
    });
};
exports.currencyShop = currencyShop;
