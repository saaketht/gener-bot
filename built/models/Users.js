"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.users = void 0;
const sequelize_1 = require("sequelize");
const users = (sequelize) => {
    return sequelize.define('users', {
        user_id: {
            type: sequelize_1.DataTypes.STRING,
            primaryKey: true,
        },
        balance: {
            type: sequelize_1.DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false,
        },
    }, {
        timestamps: false,
    });
};
exports.users = users;
