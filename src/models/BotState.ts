import { Sequelize, DataTypes } from 'sequelize';

// Small key/value store for background-job state that must survive restarts
// (e.g. the levels watcher's last-posted date).
const botState = (sequelize: Sequelize) => {
	return sequelize.define('bot_state', {
		key: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		value: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
	}, {
		timestamps: false,
	});
};

export { botState };
