import { GameState, GameResult, Player } from './types';
import { DeterministicSystems } from './DeterministicSystems';
import { LLMNarrator } from './LLMNarrator';
import { SceneManager } from './SceneManager';
import logger from '../utils/logger';

export class GameEngine {
	private state: GameState;
	private deterministic: DeterministicSystems;
	private narrator: LLMNarrator;
	private sceneManager: SceneManager;

	constructor(state: GameState) {
		this.state = state;
		this.deterministic = new DeterministicSystems(state);
		this.narrator = new LLMNarrator();
		this.sceneManager = new SceneManager(state);
	}

	async processAction(playerId: string, action: string): Promise<GameResult> {
		const player = this.state.party.members[playerId];
		if (!player) {
			return { success: false, message: 'You are not in this game.' };
		}

		// Check if player is dead
		if (player.stats.health <= 0) {
			return { success: false, message: 'You have fallen. Type `!quit` and start a new adventure.' };
		}

		// STEP 1: Try deterministic systems (0 tokens)
		const deterministicResult = this.deterministic.tryProcess(player, action);
		if (deterministicResult) {
			this.logAction(playerId, action, deterministicResult.message);
			// Update scene after movement
			if (this.isMovement(action)) {
				this.sceneManager.updateSceneForRoom();
			}
			return deterministicResult;
		}

		// STEP 2: Use LLM with minimal context
		const partyNames = Object.values(this.state.party.members).map(p => p.username);
		const llmResult = await this.narrator.narrate({
			player,
			currentRoom: this.state.worldMap[this.state.currentRoomId],
			action,
			scene: this.sceneManager.getActiveScene(),
			recentActions: this.state.recentActions.slice(-3),
			narrativeSummary: this.state.narrativeSummary,
			partyMembers: partyNames.length > 1 ? partyNames : undefined,
		});

		// STEP 3: Apply LLM stat changes
		this.applyStatChanges(player, llmResult);
		this.logAction(playerId, action, llmResult.message);

		// STEP 4: Compress narrative periodically
		if (this.state.recentActions.length >= 10) {
			await this.compressNarrative();
		}

		return llmResult;
	}

	private applyStatChanges(player: Player, result: GameResult): void {
		if (result.statChanges) {
			for (const change of result.statChanges) {
				switch (change.stat) {
				case 'health':
					player.stats.health = Math.min(
						player.stats.maxHealth,
						Math.max(0, player.stats.health + change.change),
					);
					break;
				case 'gold':
					player.stats.gold = Math.max(0, player.stats.gold + change.change);
					break;
				case 'experience':
					player.stats.experience += Math.max(0, change.change);
					break;
				}
			}
		}

		if (result.itemsGained) {
			for (const item of result.itemsGained) {
				player.inventory.push(item);
			}
		}

		if (result.itemsLost) {
			for (const lostItem of result.itemsLost) {
				const idx = player.inventory.findIndex(i => i.id === lostItem.id);
				if (idx !== -1) player.inventory.splice(idx, 1);
			}
		}
	}

	private logAction(playerId: string, action: string, result: string): void {
		const player = this.state.party.members[playerId];
		this.state.recentActions.push({
			playerId,
			playerName: player?.username || 'Unknown',
			action,
			result: result.substring(0, 500),
			timestamp: Date.now(),
		});

		if (this.state.recentActions.length > 15) {
			this.state.recentActions = this.state.recentActions.slice(-10);
		}
	}

	private async compressNarrative(): Promise<void> {
		try {
			const summary = await this.narrator.compress(this.state.recentActions);
			if (summary) {
				this.state.narrativeSummary = summary;
				this.state.recentActions = this.state.recentActions.slice(-3);
			}
		}
		catch (error) {
			logger.error('Failed to compress narrative:', error);
		}
	}

	private isMovement(action: string): boolean {
		const cmd = action.toLowerCase().trim();
		const dirs = ['north', 'south', 'east', 'west', 'up', 'down', 'n', 's', 'e', 'w', 'u', 'd'];
		if (dirs.includes(cmd)) return true;
		for (const prefix of ['go', 'move', 'walk', 'head', 'travel']) {
			if (cmd.startsWith(prefix + ' ')) return true;
		}
		return false;
	}

	/**
	 * Check and handle level up. Returns true if player leveled up.
	 */
	checkLevelUp(playerId: string): boolean {
		const player = this.state.party.members[playerId];
		if (!player) return false;

		const xpNeeded = player.stats.level * 100;
		if (player.stats.experience >= xpNeeded) {
			player.stats.level++;
			player.stats.experience -= xpNeeded;
			player.stats.maxHealth += 10;
			// Full heal on level up
			player.stats.health = player.stats.maxHealth;
			return true;
		}
		return false;
	}

	getState(): GameState {
		return this.state;
	}

	getPlayer(playerId: string): Player | undefined {
		return this.state.party.members[playerId];
	}

	getCurrentRoom() {
		return this.state.worldMap[this.state.currentRoomId];
	}
}
