import { Sequelize, DataTypes } from 'sequelize';

const lookupStats = (sequelize: Sequelize) => {
	return sequelize.define('lookup_stats', {
		user_id: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		symbol: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		count: {
			type: DataTypes.INTEGER,
			allowNull: false,
			defaultValue: 0,
		},
		last_at: {
			type: DataTypes.DATE,
			allowNull: true,
			defaultValue: null,
		},
	}, {
		timestamps: false,
	});
};

export { lookupStats };
