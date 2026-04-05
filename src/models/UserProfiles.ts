import { Sequelize, DataTypes } from 'sequelize';

const userProfiles = (sequelize: Sequelize) => {
	return sequelize.define('user_profiles', {
		user_id: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		username: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: null,
		},
		notes: {
			type: DataTypes.TEXT,
			allowNull: true,
			defaultValue: null,
		},
		last_updated: {
			type: DataTypes.DATE,
			allowNull: true,
			defaultValue: null,
		},
		interaction_count: {
			type: DataTypes.INTEGER,
			defaultValue: 0,
			allowNull: false,
		},
	}, {
		timestamps: false,
	});
};

export { userProfiles };
