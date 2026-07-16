import { Sequelize, DataTypes } from 'sequelize';

const watchlistItems = (sequelize: Sequelize) => {
	return sequelize.define('watchlist_items', {
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
		guild_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		// '' = the shared guild list. A sentinel instead of NULL so the unique
		// index below actually applies (SQLite treats NULLs as distinct).
		owner_id: {
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: '',
		},
		symbol: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		type: {
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: 'stock',
		},
		name: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: null,
		},
		added_by: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: null,
		},
	}, {
		timestamps: false,
		indexes: [
			{ unique: true, fields: ['guild_id', 'owner_id', 'symbol'] },
		],
	});
};

export { watchlistItems };
