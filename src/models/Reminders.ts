import { Sequelize, DataTypes } from 'sequelize';

const reminders = (sequelize: Sequelize) => {
	return sequelize.define('reminders', {
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
		user_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		channel_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		message: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		due_at: {
			type: DataTypes.DATE,
			allowNull: false,
		},
	}, {
		timestamps: false,
	});
};

export { reminders };
