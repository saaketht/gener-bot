export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export type RoomFlag = 'DARK' | 'SAFE' | 'SHOP' | 'DANGEROUS' | 'PUZZLE';
export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'quest' | 'treasure';
export type NPCType = 'enemy' | 'friendly' | 'merchant' | 'quest_giver';
export type SceneType = 'exploration' | 'combat' | 'dialog' | 'puzzle';
export type PartyMode = 'solo' | 'turn-based' | 'collaborative';

export interface Item {
	id: string;
	name: string;
	description: string;
	type: ItemType;
	value: number;
	damage?: number;
	defense?: number;
	healAmount?: number;
}

export interface DialogNode {
	text: string;
	options?: { label: string; next: string }[];
}

export interface NPC {
	id: string;
	name: string;
	description: string;
	type: NPCType;
	health?: number;
	maxHealth?: number;
	damage?: number;
	dialog?: DialogNode;
	shopItems?: Item[];
}

export interface Room {
	id: string;
	name: string;
	description: string;
	exits: Record<string, string>; // direction -> roomId
	items: Item[];
	npcs: NPC[];
	flags: RoomFlag[];
	visited: boolean;
}

export interface Player {
	userId: string;
	username: string;
	stats: {
		health: number;
		maxHealth: number;
		level: number;
		experience: number;
		gold: number;
	};
	inventory: Item[];
	equipped: {
		weapon?: Item;
		armor?: Item;
		accessory?: Item;
	};
	questFlags: string[];
	achievements: string[];
}

export interface PartyState {
	mode: PartyMode;
	members: Record<string, Player>; // userId -> Player
	turnOrder: string[];
	currentTurn: number;
	actionCooldown: number; // ms between actions (collaborative mode)
	lastActionTime: number; // timestamp
}

export interface Scene {
	type: SceneType;
	context: string;
	participants: string[]; // NPC/item IDs
	startedAt: number;
}

export interface ActionLog {
	playerId: string;
	playerName: string;
	action: string;
	result: string;
	timestamp: number;
}

export interface GameState {
	gameId: string;
	threadId: string;
	createdAt: number;
	lastActivity: number;
	party: PartyState;
	currentRoomId: string;
	visitedRooms: string[];
	narrativeSummary: string;
	currentScene: Scene | null;
	recentActions: ActionLog[];
	worldMap: Record<string, Room>; // roomId -> Room
	globalFlags: string[];
}

export interface StatChange {
	stat: 'health' | 'gold' | 'experience';
	change: number;
}

export interface GameResult {
	success: boolean;
	message: string;
	statChanges?: StatChange[];
	sceneChange?: Scene;
	itemsGained?: Item[];
	itemsLost?: Item[];
}
