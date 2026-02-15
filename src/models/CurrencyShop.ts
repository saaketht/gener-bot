import { Sequelize, DataTypes } from 'sequelize';

const currencyShop = (sequelize: Sequelize) => {
	return sequelize.define('currency_shop', {
		name: {
			type: DataTypes.STRING,
			unique: true,
		},
		cost: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
	}, {
		timestamps: false,
	});
};

export {
	currencyShop,
};