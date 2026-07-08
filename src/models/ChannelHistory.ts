import { Sequelize, DataTypes } from 'sequelize';

const channelHistory = (sequelize: Sequelize) => {
	return sequelize.define('channel_history', {
		channel_id: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		turns: {
			type: DataTypes.TEXT,
			allowNull: false,
			defaultValue: '[]',
		},
	}, {
		timestamps: false,
	});
};

export { channelHistory };
