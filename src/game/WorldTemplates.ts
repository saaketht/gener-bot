import { Room, Item, NPC } from './types';

export function createStarterWorld(): Record<string, Room> {
	const rooms: Record<string, Room> = {};

	rooms['tavern'] = {
		id: 'tavern',
		name: 'The Rusty Dragon Tavern',
		description: 'A cozy tavern with a crackling fireplace. The smell of stew and ale fills the air. A worn notice board hangs by the door.',
		exits: { north: 'town_square', down: 'cellar' },
		items: [
			{ id: 'rusty_sword', name: 'rusty sword', description: 'A dull but functional blade', type: 'weapon', value: 5, damage: 3 },
		],
		npcs: [
			{
				id: 'barkeep',
				name: 'Barkeep Aldric',
				description: 'A burly man polishing a mug. He looks like he knows things.',
				type: 'quest_giver',
				dialog: { text: 'Rats in the cellar again. Clear them out and I\'ll make it worth your while.' },
			},
		],
		flags: ['SAFE'],
		visited: true,
	};

	rooms['cellar'] = {
		id: 'cellar',
		name: 'Tavern Cellar',
		description: 'A dark, musty cellar filled with barrels and cobwebs. Something squeaks in the shadows.',
		exits: { up: 'tavern' },
		items: [
			{ id: 'health_potion_cellar', name: 'health potion', description: 'A small red vial', type: 'consumable', value: 10, healAmount: 25 },
		],
		npcs: [
			{
				id: 'giant_rat_1',
				name: 'Giant Rat',
				description: 'A rat the size of a dog, baring yellowed teeth',
				type: 'enemy',
				health: 15,
				maxHealth: 15,
				damage: 4,
			},
			{
				id: 'giant_rat_2',
				name: 'Giant Rat',
				description: 'Another oversized rat lurking near the barrels',
				type: 'enemy',
				health: 12,
				maxHealth: 12,
				damage: 3,
			},
		],
		flags: ['DARK'],
		visited: false,
	};

	rooms['town_square'] = {
		id: 'town_square',
		name: 'Town Square',
		description: 'The bustling center of Millhaven. A fountain gurgles in the middle. Merchants call out from stalls lining the cobblestone plaza.',
		exits: { south: 'tavern', east: 'shop', north: 'forest_path', west: 'temple' },
		items: [],
		npcs: [
			{
				id: 'merchant_aria',
				name: 'Traveling Merchant Aria',
				description: 'A sharp-eyed woman with an overloaded cart',
				type: 'merchant',
				shopItems: [
					{ id: 'health_potion', name: 'health potion', description: 'Restores 30 HP', type: 'consumable', value: 15, healAmount: 30 },
					{ id: 'iron_sword', name: 'iron sword', description: 'A solid, well-balanced blade', type: 'weapon', value: 40, damage: 8 },
					{ id: 'leather_armor', name: 'leather armor', description: 'Basic but reliable protection', type: 'armor', value: 30, defense: 5 },
				],
			},
		],
		flags: ['SAFE'],
		visited: false,
	};

	rooms['shop'] = {
		id: 'shop',
		name: 'The Gilded Anvil',
		description: 'A cramped shop filled with weapons, armor, and curiosities hanging from every surface. The forge in the back radiates warmth.',
		exits: { west: 'town_square' },
		items: [
			{ id: 'shield', name: 'wooden shield', description: 'A sturdy wooden shield', type: 'armor', value: 20, defense: 3 },
		],
		npcs: [
			{
				id: 'blacksmith',
				name: 'Blacksmith Gorn',
				description: 'A massive man covered in soot, arms like tree trunks',
				type: 'merchant',
				shopItems: [
					{ id: 'steel_sword', name: 'steel sword', description: 'A finely crafted blade', type: 'weapon', value: 80, damage: 14 },
					{ id: 'chainmail', name: 'chainmail', description: 'Interlocking metal rings', type: 'armor', value: 60, defense: 8 },
				],
			},
		],
		flags: ['SAFE', 'SHOP'],
		visited: false,
	};

	rooms['temple'] = {
		id: 'temple',
		name: 'Temple of the Dawn',
		description: 'A serene stone temple bathed in soft golden light filtering through stained glass. An altar stands at the far end.',
		exits: { east: 'town_square' },
		items: [
			{ id: 'holy_water', name: 'holy water', description: 'A blessed vial of water', type: 'consumable', value: 25, healAmount: 50 },
		],
		npcs: [
			{
				id: 'priestess',
				name: 'Priestess Lyra',
				description: 'A calm woman in white robes with knowing eyes',
				type: 'quest_giver',
				dialog: { text: 'Dark things stir in the caves to the north. Something ancient has awakened. Be careful, traveler.' },
			},
		],
		flags: ['SAFE'],
		visited: false,
	};

	rooms['forest_path'] = {
		id: 'forest_path',
		name: 'Forest Path',
		description: 'A winding dirt path through ancient oaks. Dappled sunlight filters through the canopy. The path splits ahead.',
		exits: { south: 'town_square', north: 'deep_forest', east: 'cave_entrance' },
		items: [],
		npcs: [
			{
				id: 'wolf_1',
				name: 'Timber Wolf',
				description: 'A lean grey wolf watching you from the treeline',
				type: 'enemy',
				health: 20,
				maxHealth: 20,
				damage: 6,
			},
		],
		flags: ['DANGEROUS'],
		visited: false,
	};

	rooms['deep_forest'] = {
		id: 'deep_forest',
		name: 'Deep Forest',
		description: 'The trees grow thick here, blocking most light. Strange mushrooms glow faintly on fallen logs. You hear distant howling.',
		exits: { south: 'forest_path' },
		items: [
			{ id: 'glowing_mushroom', name: 'glowing mushroom', description: 'A bioluminescent fungus, possibly magical', type: 'quest', value: 15 },
			{ id: 'hunters_bow', name: 'hunter\'s bow', description: 'A well-crafted shortbow left behind', type: 'weapon', value: 35, damage: 10 },
		],
		npcs: [
			{
				id: 'forest_spider',
				name: 'Giant Forest Spider',
				description: 'A spider as big as a horse, webs strung between the trees',
				type: 'enemy',
				health: 30,
				maxHealth: 30,
				damage: 8,
			},
		],
		flags: ['DARK', 'DANGEROUS'],
		visited: false,
	};

	rooms['cave_entrance'] = {
		id: 'cave_entrance',
		name: 'Cave Entrance',
		description: 'A yawning dark opening in the hillside. Cold air and a foul stench drift from within. Claw marks score the stone.',
		exits: { west: 'forest_path', down: 'dark_cave' },
		items: [
			{ id: 'torch', name: 'torch', description: 'An unlit torch left by a previous explorer', type: 'quest', value: 2 },
		],
		npcs: [],
		flags: ['DANGEROUS'],
		visited: false,
	};

	rooms['dark_cave'] = {
		id: 'dark_cave',
		name: 'Dark Cave',
		description: 'Almost total darkness. Water drips from stalactites. The ground is uneven and slick. Something large breathes in the shadows ahead.',
		exits: { up: 'cave_entrance', north: 'treasure_room' },
		items: [],
		npcs: [
			{
				id: 'cave_troll',
				name: 'Cave Troll',
				description: 'A hulking troll, easily eight feet tall, with grey mottled skin and tiny furious eyes',
				type: 'enemy',
				health: 60,
				maxHealth: 60,
				damage: 12,
			},
		],
		flags: ['DARK', 'DANGEROUS', 'PUZZLE'],
		visited: false,
	};

	rooms['treasure_room'] = {
		id: 'treasure_room',
		name: 'Hidden Treasure Room',
		description: 'A small chamber glittering with gold coins and gemstones. An ornate chest sits on a stone pedestal in the center.',
		exits: { south: 'dark_cave' },
		items: [
			{ id: 'gold_pile', name: 'pile of gold', description: 'A generous heap of gold coins', type: 'treasure', value: 100 },
			{ id: 'enchanted_blade', name: 'enchanted blade', description: 'A sword that hums with arcane energy', type: 'weapon', value: 150, damage: 20 },
			{ id: 'amulet_of_protection', name: 'amulet of protection', description: 'A silver amulet that pulses with warmth', type: 'accessory', value: 75 },
		],
		npcs: [],
		flags: ['SAFE'],
		visited: false,
	};

	return rooms;
}
