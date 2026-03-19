import { GameResult, StatChange, Item } from './types';

/**
 * Parse LLM response text for narrative and structured stat changes.
 * Expected format from LLM:
 *   "Narrative text here.\n[STATS: health:+10, gold:-5, item:+rusty_key, xp:+25]"
 */
export function parseNarratorResponse(response: string): GameResult {
	const statsMatch = response.match(/\[STATS:\s*([^\]]+)\]/);
	const statChanges: StatChange[] = [];
	const itemsGained: Item[] = [];
	const itemsLost: Item[] = [];

	if (statsMatch) {
		const pairs = statsMatch[1].split(',').map(p => p.trim());

		for (const pair of pairs) {
			const colonIndex = pair.indexOf(':');
			if (colonIndex === -1) continue;

			const key = pair.slice(0, colonIndex).trim().toLowerCase();
			const value = pair.slice(colonIndex + 1).trim();

			if (key === 'item') {
				if (value.startsWith('+')) {
					itemsGained.push(createItemFromId(value.slice(1)));
				} else if (value.startsWith('-')) {
					itemsLost.push(createItemFromId(value.slice(1)));
				}
			} else if (key === 'health' || key === 'hp') {
				const change = parseInt(value);
				if (!isNaN(change)) statChanges.push({ stat: 'health', change });
			} else if (key === 'gold' || key === 'money') {
				const change = parseInt(value);
				if (!isNaN(change)) statChanges.push({ stat: 'gold', change });
			} else if (key === 'xp' || key === 'experience' || key === 'exp') {
				const change = parseInt(value);
				if (!isNaN(change)) statChanges.push({ stat: 'experience', change });
			}
		}
	}

	// Remove the stats block from narrative
	const narrative = response.replace(/\[STATS:[^\]]*\]/, '').trim();

	return {
		success: true,
		message: narrative,
		statChanges: statChanges.length > 0 ? statChanges : undefined,
		itemsGained: itemsGained.length > 0 ? itemsGained : undefined,
		itemsLost: itemsLost.length > 0 ? itemsLost : undefined,
	};
}

function createItemFromId(itemId: string): Item {
	const name = itemId.replace(/_/g, ' ');
	return {
		id: itemId,
		name,
		description: `A ${name}`,
		type: 'quest',
		value: 10,
	};
}
