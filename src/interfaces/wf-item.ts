import { Category, MinimalItem, Type } from 'warframe-items';

// Ability interface for Warframes
interface Ability {
	name: string;
	description?: string;
}

// Level stats for mods
interface LevelStat {
	stats: string[];
}

// Damage types for weapons
interface DamageTypes {
	impact?: number;
	puncture?: number;
	slash?: number;
	heat?: number;
	cold?: number;
	electricity?: number;
	toxin?: number;
	blast?: number;
	radiation?: number;
	magnetic?: number;
	corrosive?: number;
	viral?: number;
	gas?: number;
	void?: number;
	total?: number;
}

// Relic reward structure
interface RelicReward {
	rarity: string;
	chance: number;
	item?: {
		uniqueName: string;
		name: string;
	};
}

// Drop location structure
interface Drop {
	chance: number | null;
	location: string;
	rarity?: string;
	type?: string;
}

// Polarity type
type Polarity = 'aura' | 'madurai' | 'naramon' | 'penjaga' | 'umbra' | 'unairu' | 'universal' | 'vazarin' | 'zenurik' | 'any';

interface WarframeItem extends MinimalItem {
	name: string;
	category?: Category;
	description?: string;
	uniqueName: string;
	type?: Type;
	tradable: boolean;
	imageName?: string;

	// Computed at runtime
	wikiLink?: string;
	imageLink?: string;

	// Drop locations (optional - not all items have drops)
	drops?: Drop[];

	// Warframe stats
	health?: number;
	shield?: number;
	armor?: number;
	power?: number;
	sprintSpeed?: number;
	abilities?: Ability[];
	passiveDescription?: string;
	masteryReq?: number;

	// Weapon stats (Primary/Secondary/Melee)
	totalDamage?: number;
	criticalChance?: number;
	criticalMultiplier?: number;
	procChance?: number;
	fireRate?: number;
	damage?: DamageTypes;
	magazineSize?: number;
	reloadTime?: number;

	// Melee-specific
	range?: number;
	comboDuration?: number;
	blockingAngle?: number;

	// Mod stats
	baseDrain?: number;
	fusionLimit?: number;
	polarity?: Polarity;
	levelStats?: LevelStat[];
	rarity?: string;

	// Relic stats
	rewards?: RelicReward[];
	vaulted?: boolean;

	// Arcane stats
	effect?: string;
}

export default WarframeItem;
export type { Ability, LevelStat, DamageTypes, RelicReward, Drop, Polarity };
