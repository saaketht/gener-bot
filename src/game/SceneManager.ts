import { GameState, Scene, Room } from './types';

export class SceneManager {
	private state: GameState;

	constructor(state: GameState) {
		this.state = state;
	}

	getActiveScene(): Scene | null {
		return this.state.currentScene;
	}

	/**
	 * Build minimal context string for LLM prompt based on current scene or room.
	 * Keeps context under ~150 tokens.
	 */
	buildSceneContext(): string {
		const scene = this.state.currentScene;
		const room = this.state.worldMap[this.state.currentRoomId];

		if (scene) {
			return `Current situation: ${scene.context}`;
		}

		return this.buildRoomContext(room);
	}

	private buildRoomContext(room: Room): string {
		let ctx = `Location: ${room.name}\n${room.description}\n`;

		if (room.npcs.length > 0) {
			ctx += `NPCs: ${room.npcs.map(n => {
				if (n.type === 'enemy' && n.health !== undefined) {
					return `${n.name} (enemy, ${n.health}/${n.maxHealth} HP)`;
				}
				return `${n.name} (${n.type})`;
			}).join(', ')}\n`;
		}

		if (room.items.length > 0) {
			ctx += `Items: ${room.items.map(i => i.name).join(', ')}\n`;
		}

		if (room.flags.length > 0) {
			ctx += `Flags: ${room.flags.join(', ')}\n`;
		}

		return ctx;
	}

	startCombatScene(enemyIds: string[]): void {
		const room = this.state.worldMap[this.state.currentRoomId];
		const enemies = room.npcs.filter(n => enemyIds.includes(n.id));

		this.state.currentScene = {
			type: 'combat',
			context: `In combat with ${enemies.map(e => e.name).join(', ')} in ${room.name}`,
			participants: enemyIds,
			startedAt: Date.now(),
		};
	}

	startDialogScene(npcId: string): void {
		const room = this.state.worldMap[this.state.currentRoomId];
		const npc = room.npcs.find(n => n.id === npcId);
		if (!npc) return;

		this.state.currentScene = {
			type: 'dialog',
			context: `Speaking with ${npc.name}: "${npc.dialog?.text || 'They have nothing to say.'}"`,
			participants: [npcId],
			startedAt: Date.now(),
		};
	}

	endScene(): void {
		this.state.currentScene = null;
	}

	/**
	 * Auto-detect scene transitions based on room state.
	 * Call after movement or combat to update scene context.
	 */
	updateSceneForRoom(): void {
		const room = this.state.worldMap[this.state.currentRoomId];
		const hasEnemies = room.npcs.some(n => n.type === 'enemy');

		if (hasEnemies && room.flags.includes('DANGEROUS')) {
			const enemyIds = room.npcs.filter(n => n.type === 'enemy').map(n => n.id);
			this.startCombatScene(enemyIds);
		}
		else {
			this.endScene();
		}
	}
}
