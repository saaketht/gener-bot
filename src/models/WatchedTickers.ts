import { DataTypes, Sequelize } from 'sequelize';

const watchedTickers = (sequelize: Sequelize) => {
	return sequelize.define('watched_tickers', {
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
		},
		symbol: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		name: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		type: {
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: 'stock',
		},
		added_by: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		guild_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
	}, { timestamps: false });
};

export { watchedTickers };
