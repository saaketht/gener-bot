import { Message } from 'discord.js';
import { GameState } from './engine';
import { TetrisScores } from '../../models/dbObjects';
import logger from '../../utils/logger';

export interface Session {
	state: GameState;
	message: Message;
	timer: NodeJS.Timeout | null;
	username: string;
	guildId: string | null;
}

export const tetrisSessions = new Map<string, Session>();
export const userActiveGames = new Map<string, string>();

export const MAX_SESSIONS = 50;
export const SESSION_TTL_MS = 30 * 60 * 1000;

export type EndReason = 'gameover' | 'quit' | 'ttl' | 'new';

export function endSession(messageId: string, reason: EndReason): void {
	const session = tetrisSessions.get(messageId);
	if (!session) return;

	if (session.timer) {
		clearInterval(session.timer);
		session.timer = null;
	}

	if (reason === 'gameover') {
		const { state, username, guildId } = session;
		TetrisScores.create({
			user_id: state.ownerId,
			username,
			guild_id: guildId,
			score: state.score,
			lines: state.lines,
			level: state.level,
			duration_ms: Date.now() - state.createdAt,
		}).catch(err => logger.error('tetris: failed to record score', { err }));
	}

	if (reason !== 'new') {
		tetrisSessions.delete(messageId);
		if (userActiveGames.get(session.state.ownerId) === messageId) {
			userActiveGames.delete(session.state.ownerId);
		}
	}
}

export function sweepStaleSessions(): void {
	const now = Date.now();
	for (const [id, s] of tetrisSessions) {
		if (now - s.state.lastMove > SESSION_TTL_MS) endSession(id, 'ttl');
	}
}
