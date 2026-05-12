import { Sequelize, DataTypes } from 'sequelize';

const tetrisScores = (sequelize: Sequelize) => {
	return sequelize.define('tetris_scores', {
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
		},
		user_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		username: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		guild_id: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		score: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		lines: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		level: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		duration_ms: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
	}, {
		timestamps: true,
		createdAt: 'created_at',
		updatedAt: false,
		indexes: [
			{ fields: ['score'] },
			{ fields: ['user_id'] },
		],
	});
};

export { tetrisScores };
