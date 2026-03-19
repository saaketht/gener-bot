import { GameState, Player, PartyMode } from './types';

export interface CanActResult {
	canAct: boolean;
	reason?: string;
}

export class MultiplayerManager {
	canPlayerAct(state: GameState, playerId: string): CanActResult {
		const party = state.party;

		if (!party.members[playerId]) {
			return { canAct: false, reason: 'You are not in this adventure. Type `!join` to join.' };
		}

		if (party.mode === 'solo') {
			return { canAct: true };
		}

		if (party.mode === 'turn-based') {
			const currentPlayerId = party.turnOrder[party.currentTurn];
			if (playerId !== currentPlayerId) {
				const currentPlayer = party.members[currentPlayerId];
				return {
					canAct: false,
					reason: `It's ${currentPlayer?.username}'s turn.`,
				};
			}
			return { canAct: true };
		}

		if (party.mode === 'collaborative') {
			const timeSince = Date.now() - party.lastActionTime;
			if (timeSince < party.actionCooldown) {
				const waitSeconds = Math.ceil((party.actionCooldown - timeSince) / 1000);
				return {
					canAct: false,
					reason: `Please wait ${waitSeconds}s before the next action.`,
				};
			}
			return { canAct: true };
		}

		return { canAct: false, reason: 'Unknown party mode.' };
	}

	advanceTurn(state: GameState): void {
		if (state.party.mode !== 'turn-based') return;
		if (state.party.turnOrder.length === 0) return;
		state.party.currentTurn = (state.party.currentTurn + 1) % state.party.turnOrder.length;
	}

	getCurrentPlayer(state: GameState): Player | null {
		if (state.party.mode !== 'turn-based') return null;
		const playerId = state.party.turnOrder[state.party.currentTurn];
		return state.party.members[playerId] || null;
	}

	addPlayer(state: GameState, userId: string, username: string): Player {
		const newPlayer: Player = {
			userId,
			username,
			stats: {
				health: 100,
				maxHealth: 100,
				level: 1,
				experience: 0,
				gold: 10,
			},
			inventory: [],
			equipped: {},
			questFlags: [],
			achievements: [],
		};

		state.party.members[userId] = newPlayer;

		if (state.party.mode === 'turn-based') {
			state.party.turnOrder.push(userId);
		}

		// Switch from solo to collaborative when second player joins
		if (Object.keys(state.party.members).length === 2 && state.party.mode === 'solo') {
			state.party.mode = 'collaborative';
			state.party.actionCooldown = 3000;
		}

		return newPlayer;
	}

	removePlayer(state: GameState, userId: string): void {
		delete state.party.members[userId];

		state.party.turnOrder = state.party.turnOrder.filter(id => id !== userId);

		if (state.party.currentTurn >= state.party.turnOrder.length) {
			state.party.currentTurn = 0;
		}

		// Switch back to solo if only one player remains
		if (Object.keys(state.party.members).length === 1) {
			state.party.mode = 'solo';
		}
	}

	setMode(state: GameState, mode: PartyMode): void {
		state.party.mode = mode;

		if (mode === 'turn-based' && state.party.turnOrder.length === 0) {
			state.party.turnOrder = Object.keys(state.party.members);
			state.party.currentTurn = 0;
		}

		if (mode === 'collaborative') {
			// 3 second cooldown
			state.party.actionCooldown = 3000;
		}
	}

	getPartySize(state: GameState): number {
		return Object.keys(state.party.members).length;
	}
}
