import { GameState, GameResult, Player, Room, Direction, Item, NPC } from './types';

const DIRECTION_ALIASES: Record<string, Direction> = {
	n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down',
	north: 'north', south: 'south', east: 'east', west: 'west', up: 'up', down: 'down',
};

const MOVEMENT_PREFIXES = ['go', 'move', 'walk', 'head', 'travel'];

export class DeterministicSystems {
	private state: GameState;

	constructor(state: GameState) {
		this.state = state;
	}

	tryProcess(player: Player, action: string): GameResult | null {
		const cmd = action.toLowerCase().trim();

		if (this.isMovementCommand(cmd)) return this.handleMovement(player, cmd);
		if (this.isCombatCommand(cmd)) return this.handleCombat(player, cmd);
		if (this.isItemCommand(cmd)) return this.handleItem(player, cmd);
		if (this.isUseCommand(cmd)) return this.handleUse(player, cmd);
		if (this.isEquipCommand(cmd)) return this.handleEquip(player, cmd);
		if (cmd === 'look' || cmd === 'l') return this.lookAround();
		if (cmd === 'inventory' || cmd === 'i') return this.showInventory(player);
		if (cmd === 'stats' || cmd === 'status') return this.showStats(player);
		if (cmd === 'help' || cmd === 'h' || cmd === '?') return this.showHelp();

		return null; // not a deterministic command — fall through to LLM
	}

	// --- Movement ---

	private isMovementCommand(cmd: string): boolean {
		if (DIRECTION_ALIASES[cmd]) return true;
		for (const prefix of MOVEMENT_PREFIXES) {
			if (cmd.startsWith(prefix + ' ')) {
				const dir = cmd.slice(prefix.length + 1).trim();
				if (DIRECTION_ALIASES[dir]) return true;
			}
		}
		return false;
	}

	private handleMovement(_player: Player, cmd: string): GameResult {
		const direction = this.parseDirection(cmd);
		if (!direction) {
			return { success: false, message: 'Invalid direction.' };
		}

		const currentRoom = this.state.worldMap[this.state.currentRoomId];
		const nextRoomId = currentRoom.exits[direction];

		if (!nextRoomId) {
			return { success: false, message: 'You can\'t go that way.' };
		}

		const nextRoom = this.state.worldMap[nextRoomId];
		if (!nextRoom) {
			return { success: false, message: 'That path leads nowhere.' };
		}

		this.state.currentRoomId = nextRoomId;
		nextRoom.visited = true;
		if (!this.state.visitedRooms.includes(nextRoomId)) {
			this.state.visitedRooms.push(nextRoomId);
		}

		return {
			success: true,
			message: this.buildRoomDescription(nextRoom),
		};
	}

	private parseDirection(cmd: string): Direction | null {
		if (DIRECTION_ALIASES[cmd]) return DIRECTION_ALIASES[cmd];
		for (const prefix of MOVEMENT_PREFIXES) {
			if (cmd.startsWith(prefix + ' ')) {
				const dir = cmd.slice(prefix.length + 1).trim();
				if (DIRECTION_ALIASES[dir]) return DIRECTION_ALIASES[dir];
			}
		}
		return null;
	}

	// --- Combat ---

	private isCombatCommand(cmd: string): boolean {
		return /^(attack|fight|kill|hit|strike)\s+.+$/i.test(cmd);
	}

	private handleCombat(player: Player, cmd: string): GameResult {
		const match = cmd.match(/^(?:attack|fight|kill|hit|strike)\s+(.+)$/i);
		if (!match) return { success: false, message: 'Attack what?' };

		const targetName = match[1].trim();
		const room = this.state.worldMap[this.state.currentRoomId];
		const enemy = this.findNPC(room, targetName, 'enemy');

		if (!enemy) {
			return { success: false, message: `There's no "${targetName}" here to fight.` };
		}

		if (enemy.health === undefined || enemy.maxHealth === undefined) {
			return { success: false, message: `You can't fight ${enemy.name}.` };
		}

		const playerDamage = this.calculateDamage(player);
		const enemyDamage = enemy.damage || 5;
		const armorReduction = player.equipped.armor?.defense || 0;
		const actualEnemyDamage = Math.max(1, enemyDamage - armorReduction);

		enemy.health -= playerDamage;

		if (enemy.health <= 0) {
			// Enemy defeated
			room.npcs = room.npcs.filter(n => n.id !== enemy.id);

			const goldReward = Math.floor(Math.random() * 15) + 5 + (enemy.maxHealth || 10);
			const xpReward = (enemy.maxHealth || 10) * 2;

			player.stats.gold += goldReward;
			player.stats.experience += xpReward;

			return {
				success: true,
				message: `You strike the **${enemy.name}** for **${playerDamage}** damage — a killing blow! ` +
					`You gain **${goldReward} gold** and **${xpReward} XP**.`,
				statChanges: [
					{ stat: 'gold', change: goldReward },
					{ stat: 'experience', change: xpReward },
				],
			};
		}

		// Enemy survives, counterattacks
		player.stats.health -= actualEnemyDamage;

		const result: GameResult = {
			success: true,
			message: `You hit the **${enemy.name}** for **${playerDamage}** damage! (${enemy.health}/${enemy.maxHealth} HP remaining)\n` +
				`The **${enemy.name}** strikes back for **${actualEnemyDamage}** damage.`,
			statChanges: [
				{ stat: 'health', change: -actualEnemyDamage },
			],
		};

		if (player.stats.health <= 0) {
			player.stats.health = 0;
			result.message += '\n\n**You have fallen!** Your vision fades to black...';
		}

		return result;
	}

	private calculateDamage(player: Player): number {
		const baseDamage = 3;
		const weaponDamage = player.equipped.weapon?.damage || 0;
		const levelBonus = Math.floor(player.stats.level / 2);
		const variance = Math.floor(Math.random() * 4);
		return baseDamage + weaponDamage + levelBonus + variance;
	}

	// --- Items ---

	private isItemCommand(cmd: string): boolean {
		return /^(get|take|pickup|grab|pick up)\s+.+$/i.test(cmd) ||
			/^(drop|discard)\s+.+$/i.test(cmd);
	}

	private handleItem(player: Player, cmd: string): GameResult {
		const getMatch = cmd.match(/^(?:get|take|pickup|grab|pick up)\s+(.+)$/i);
		if (getMatch) {
			const itemName = getMatch[1].trim();
			const room = this.state.worldMap[this.state.currentRoomId];
			const itemIndex = room.items.findIndex(i =>
				i.name.toLowerCase().includes(itemName.toLowerCase())
			);

			if (itemIndex === -1) {
				return { success: false, message: `There's no "${itemName}" here.` };
			}

			const item = room.items.splice(itemIndex, 1)[0];
			player.inventory.push(item);

			return {
				success: true,
				message: `You picked up the **${item.name}**.`,
				itemsGained: [item],
			};
		}

		const dropMatch = cmd.match(/^(?:drop|discard)\s+(.+)$/i);
		if (dropMatch) {
			const itemName = dropMatch[1].trim();
			const itemIndex = player.inventory.findIndex(i =>
				i.name.toLowerCase().includes(itemName.toLowerCase())
			);

			if (itemIndex === -1) {
				return { success: false, message: `You don't have a "${itemName}".` };
			}

			const item = player.inventory.splice(itemIndex, 1)[0];
			const room = this.state.worldMap[this.state.currentRoomId];
			room.items.push(item);

			// Unequip if equipped
			if (player.equipped.weapon?.id === item.id) player.equipped.weapon = undefined;
			if (player.equipped.armor?.id === item.id) player.equipped.armor = undefined;
			if (player.equipped.accessory?.id === item.id) player.equipped.accessory = undefined;

			return {
				success: true,
				message: `You dropped the **${item.name}**.`,
				itemsLost: [item],
			};
		}

		return null as unknown as GameResult;
	}

	// --- Use items ---

	private isUseCommand(cmd: string): boolean {
		return /^(use|drink|eat|consume)\s+.+$/i.test(cmd);
	}

	private handleUse(player: Player, cmd: string): GameResult {
		const match = cmd.match(/^(?:use|drink|eat|consume)\s+(.+)$/i);
		if (!match) return { success: false, message: 'Use what?' };

		const itemName = match[1].trim();
		const itemIndex = player.inventory.findIndex(i =>
			i.name.toLowerCase().includes(itemName.toLowerCase())
		);

		if (itemIndex === -1) {
			return { success: false, message: `You don't have a "${itemName}".` };
		}

		const item = player.inventory[itemIndex];

		if (item.type === 'consumable' && item.healAmount) {
			player.inventory.splice(itemIndex, 1);
			const healed = Math.min(item.healAmount, player.stats.maxHealth - player.stats.health);
			player.stats.health += healed;

			return {
				success: true,
				message: `You used the **${item.name}** and restored **${healed} HP**. (${player.stats.health}/${player.stats.maxHealth})`,
				statChanges: [{ stat: 'health', change: healed }],
				itemsLost: [item],
			};
		}

		if (item.type === 'weapon' || item.type === 'armor') {
			return this.equipItem(player, item);
		}

		return { success: false, message: `You can't use the **${item.name}** like that.` };
	}

	// --- Equip ---

	private isEquipCommand(cmd: string): boolean {
		return /^(equip|wear|wield)\s+.+$/i.test(cmd);
	}

	private handleEquip(player: Player, cmd: string): GameResult {
		const match = cmd.match(/^(?:equip|wear|wield)\s+(.+)$/i);
		if (!match) return { success: false, message: 'Equip what?' };

		const itemName = match[1].trim();
		const item = player.inventory.find(i =>
			i.name.toLowerCase().includes(itemName.toLowerCase())
		);

		if (!item) {
			return { success: false, message: `You don't have a "${itemName}".` };
		}

		return this.equipItem(player, item);
	}

	private equipItem(player: Player, item: Item): GameResult {
		if (item.type === 'weapon') {
			const old = player.equipped.weapon;
			player.equipped.weapon = item;
			const msg = old
				? `You swap your **${old.name}** for the **${item.name}**. (+${item.damage || 0} damage)`
				: `You equip the **${item.name}**. (+${item.damage || 0} damage)`;
			return { success: true, message: msg };
		}

		if (item.type === 'armor') {
			const old = player.equipped.armor;
			player.equipped.armor = item;
			const msg = old
				? `You swap your **${old.name}** for the **${item.name}**. (+${item.defense || 0} defense)`
				: `You equip the **${item.name}**. (+${item.defense || 0} defense)`;
			return { success: true, message: msg };
		}

		return { success: false, message: `You can't equip the **${item.name}**.` };
	}

	// --- Info commands ---

	private lookAround(): GameResult {
		const room = this.state.worldMap[this.state.currentRoomId];
		return { success: true, message: this.buildRoomDescription(room) };
	}

	private showInventory(player: Player): GameResult {
		if (player.inventory.length === 0) {
			return { success: true, message: 'Your inventory is empty.' };
		}

		let msg = '**Inventory:**\n';
		for (const item of player.inventory) {
			const equipped =
				(player.equipped.weapon?.id === item.id) ||
				(player.equipped.armor?.id === item.id) ||
				(player.equipped.accessory?.id === item.id);
			msg += `- ${item.name}${equipped ? ' *(equipped)*' : ''} — ${item.description}\n`;
		}

		return { success: true, message: msg };
	}

	private showStats(player: Player): GameResult {
		const weapon = player.equipped.weapon;
		const armor = player.equipped.armor;
		let msg = `**${player.username}** — Level ${player.stats.level}\n`;
		msg += `HP: ${player.stats.health}/${player.stats.maxHealth}\n`;
		msg += `XP: ${player.stats.experience}/${player.stats.level * 100}\n`;
		msg += `Gold: ${player.stats.gold}\n`;
		if (weapon) msg += `Weapon: ${weapon.name} (+${weapon.damage || 0} dmg)\n`;
		if (armor) msg += `Armor: ${armor.name} (+${armor.defense || 0} def)\n`;
		return { success: true, message: msg };
	}

	private showHelp(): GameResult {
		return {
			success: true,
			message:
				'**Commands:**\n' +
				'`north/south/east/west/up/down` (or `n/s/e/w/u/d`) — Move\n' +
				'`look` — Examine surroundings\n' +
				'`attack <target>` — Fight an enemy\n' +
				'`get <item>` / `drop <item>` — Pick up or drop items\n' +
				'`use <item>` — Use a consumable\n' +
				'`equip <item>` — Equip weapon or armor\n' +
				'`inventory` — Check your pack\n' +
				'`stats` — View your stats\n' +
				'`!join` — Join this adventure\n' +
				'`!party` — See party members\n' +
				'`!mode solo|turn|coop` — Change party mode\n' +
				'`!quit` — Leave the adventure\n' +
				'\nOr just describe what you want to do!',
		};
	}

	// --- Helpers ---

	private buildRoomDescription(room: Room): string {
		let desc = `**${room.name}**\n${room.description}\n\n`;

		const exits = Object.keys(room.exits).join(', ');
		desc += `*Exits: ${exits}*\n`;

		if (room.items.length > 0) {
			desc += `*You see: ${room.items.map(i => i.name).join(', ')}*\n`;
		}

		if (room.npcs.length > 0) {
			const enemies = room.npcs.filter(n => n.type === 'enemy');
			const others = room.npcs.filter(n => n.type !== 'enemy');
			if (enemies.length > 0) {
				desc += `*Enemies: ${enemies.map(n => `${n.name} (${n.health}/${n.maxHealth} HP)`).join(', ')}*\n`;
			}
			if (others.length > 0) {
				desc += `*Present: ${others.map(n => n.name).join(', ')}*`;
			}
		}

		return desc;
	}

	private findNPC(room: Room, name: string, type?: string): NPC | null {
		return room.npcs.find(n => {
			const nameMatch = n.name.toLowerCase().includes(name.toLowerCase());
			const typeMatch = type ? n.type === type : true;
			return nameMatch && typeMatch;
		}) || null;
	}
}
