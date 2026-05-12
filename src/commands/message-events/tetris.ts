import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { newGame } from '../../game/tetris/engine';
import { renderButtons, renderEmbed } from '../../game/tetris/render';
import {
	MAX_SESSIONS,
	Session,
	sweepStaleSessions,
	tetrisSessions,
	userActiveGames,
} from '../../game/tetris/sessions';
import { startGravity } from '../../game/tetris/loop';
import { getTopScoresEmbed } from '../../game/tetris/leaderboard';

const messageEvent: MessageEvent = {
	name: 'tetris',
	async execute(message) {
		if (message.author.bot) return;
		const parts = message.content.trim().toLowerCase().split(/\s+/);
		if (parts[0] !== 'tetris') return;

		if (parts[1] === 'top' || parts[1] === 'leaderboard') {
			try {
				const embed = await getTopScoresEmbed(10, message.guildId);
				await message.reply({ embeds: [embed] });
			}
			catch (error) {
				logger.error('tetris leaderboard error:', error);
				await message.reply('failed to load leaderboard');
			}
			return;
		}

		if (parts.length > 1) return;

		sweepStaleSessions();

		const existingId = userActiveGames.get(message.author.id);
		if (existingId) {
			const existing = tetrisSessions.get(existingId);
			if (existing) {
				const url = `https://discord.com/channels/${message.guildId ?? '@me'}/${existing.message.channelId}/${existingId}`;
				await message.reply(`you already have a game running: ${url}`);
				return;
			}
			userActiveGames.delete(message.author.id);
		}

		if (tetrisSessions.size >= MAX_SESSIONS) {
			await message.reply('too many tetris games running, try again later');
			return;
		}

		const state = newGame(message.author.id);
		try {
			const reply = await message.reply({
				embeds: [renderEmbed(state)],
				components: renderButtons(state),
			});

			const session: Session = {
				state,
				message: reply,
				timer: null,
				username: message.author.username,
				guildId: message.guildId,
			};
			tetrisSessions.set(reply.id, session);
			userActiveGames.set(message.author.id, reply.id);
			startGravity(session);
			logger.info(`tetris: started by ${message.author.username} (msg=${reply.id})`);
		}
		catch (error) {
			logger.error('tetris start error:', error);
		}
	},
};

export default messageEvent;
