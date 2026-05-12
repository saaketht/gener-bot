import { EmbedBuilder } from 'discord.js';
import { TetrisScores } from '../../models/dbObjects';

interface ScoreRow {
	user_id: string;
	username: string | null;
	score: number;
	lines: number;
	level: number;
}

export async function getTopScoresEmbed(limit = 10, guildId: string | null = null): Promise<EmbedBuilder> {
	const where: Record<string, any> = {};
	if (guildId) where.guild_id = guildId;

	const rows = await TetrisScores.findAll({
		where,
		order: [['score', 'DESC']],
		limit,
		raw: true,
	}) as unknown as ScoreRow[];

	if (rows.length === 0) {
		return new EmbedBuilder()
			.setTitle('Tetris Leaderboard')
			.setColor(0x5865f2)
			.setDescription('no scores yet — be the first');
	}

	const pad = (s: string | number, n: number) => String(s).padStart(n, ' ');
	const lines = rows.map((r, i) => {
		const rank = pad(`${i + 1}.`, 3);
		const score = pad(r.score, 7);
		const linesN = pad(r.lines, 3);
		const lvl = pad(r.level, 2);
		const name = (r.username ?? r.user_id).slice(0, 18);
		return `${rank} ${score}  L${lvl}  ${linesN}ln  ${name}`;
	});

	return new EmbedBuilder()
		.setTitle('Tetris Leaderboard')
		.setColor(0xf1c40f)
		.setDescription('```\n' + lines.join('\n') + '\n```');
}
