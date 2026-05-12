import { applyAction } from './engine';
import { renderButtons, renderEmbed } from './render';
import { Session, endSession } from './sessions';
import logger from '../../utils/logger';

const MIN_TICK_MS = 1000;
const BASE_TICK_MS = 1500;

function tickInterval(level: number): number {
	return Math.max(MIN_TICK_MS, BASE_TICK_MS - (level - 1) * 100);
}

export function stopGravity(session: Session): void {
	if (session.timer) {
		clearInterval(session.timer);
		session.timer = null;
	}
}

export function startGravity(session: Session): void {
	stopGravity(session);
	if (session.state.gameOver) return;

	const ms = tickInterval(session.state.level);
	session.timer = setInterval(async () => {
		if (session.state.gameOver) {
			stopGravity(session);
			return;
		}

		const prevLevel = session.state.level;
		applyAction(session.state, 'soft');

		try {
			await session.message.edit({
				embeds: [renderEmbed(session.state)],
				components: renderButtons(session.state),
			});
		}
		catch (err: any) {
			if (err?.code !== 10008 && err?.status !== 429) {
				logger.warn('tetris: gravity edit failed', { code: err?.code, status: err?.status });
			}
			if (err?.code === 10008) {
				endSession(session.message.id, 'ttl');
				return;
			}
		}

		if (session.state.gameOver) {
			endSession(session.message.id, 'gameover');
			return;
		}

		if (session.state.level !== prevLevel) {
			startGravity(session);
		}
	}, ms);
}
