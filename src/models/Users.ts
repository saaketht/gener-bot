import { Sequelize, DataTypes } from 'sequelize';

const users = (sequelize: Sequelize) => {
	return sequelize.define('users', {
		user_id: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		balance: {
			type: DataTypes.INTEGER,
			defaultValue: 0,
			allowNull: false,
		},
		last_daily_claim: {
			type: DataTypes.DATE,
			allowNull: true,
			defaultValue: null,
		},
	}, {
		timestamps: false,
	});
};

export {
	users,
};