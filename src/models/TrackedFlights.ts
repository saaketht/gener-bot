import { DataTypes, Sequelize } from 'sequelize';

const trackedFlights = (sequelize: Sequelize) => {
	return sequelize.define('tracked_flights', {
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
		},
		user_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		guild_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		channel_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		message_id: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: null,
		},
		flight_number: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		flight_date: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		status: {
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: 'scheduled',
		},
		last_api_data: {
			type: DataTypes.TEXT,
			allowNull: true,
			defaultValue: null,
		},
		created_at: {
			type: DataTypes.DATE,
			allowNull: false,
			defaultValue: DataTypes.NOW,
		},
		expires_at: {
			type: DataTypes.DATE,
			allowNull: false,
		},
		active: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: true,
		},
	}, { timestamps: false });
};

export { trackedFlights };
