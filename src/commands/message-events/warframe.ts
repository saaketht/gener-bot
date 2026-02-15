import { getWarframeItemEmbed } from '../../embeds/embeds';
import { Message } from 'discord.js';
import WarframeItem from '../../interfaces/wf-item';
import Items from 'warframe-items';
import Fuse from 'fuse.js';

// Initialize items and fuzzy search once at module load
const items = new Items({ category: ['All'] });

// Higher threshold (0.6) = more candidate results returned for suggestions
// Lower auto-select threshold (0.2) = only auto-select very close matches (typos)
const fuse = new Fuse(items, {
	keys: ['name'],
	threshold: 0.6,
	includeScore: true,
	minMatchCharLength: 2,
});

// Score threshold for auto-selecting fuzzy match (lower = stricter)
const FUZZY_AUTO_SELECT_THRESHOLD = 0.2;

// Prepare item for display
const prepareItemForDisplay = (entry: WarframeItem): WarframeItem => {
	// Clean HTML tags from description
	if (entry.description) {
		entry.description = entry.description.replace(/<[^>]*>?/gm, '');
	}

	// Add computed properties
	entry.wikiLink = `https://warframe.fandom.com/wiki/${encodeURI(entry.name.replace(/ /g, '_'))}`;
	if (entry.imageName) {
		entry.imageLink = `https://cdn.warframestat.us/img/${entry.imageName}`;
	}

	return entry;
};

module.exports = {
	name: 'warframe',
	aliases: ['wf', 'warframe'],
	description: 'Search for a Warframe item.',
	usage: '<item>',
	async execute(message: Message) {
		if (message.author.bot) return;

		const command = message.content.toLowerCase().split(' ');

		if (command[0] === 'wf' || command[0] === 'warframe') {
			const searchQuery = command.slice(1);
			const query = searchQuery.join(' ').trim();

			if (!query) {
				message.reply('Please enter an item to search for.');
				return;
			}

			console.log(`Warframe search: "${query}"`);

			// 1. Try exact match first (case-insensitive)
			const exactMatch = items.find(
				(i) => i.name?.toLowerCase() === query.toLowerCase(),
			);

			if (exactMatch) {
				console.log(`Exact match found: ${exactMatch.name}`);
				const entry = prepareItemForDisplay(exactMatch as WarframeItem);

				if (!entry.name) {
					message.reply(`'${query}' has invalid data.`);
					return;
				}

				message.reply({
					embeds: [getWarframeItemEmbed(message.author, entry)],
				});
				return;
			}

			// 2. Try fuzzy search
			const fuzzyResults = fuse.search(query);

			if (fuzzyResults.length === 0) {
				message.reply(`'${query}' not found.`);
				console.log('Item not found (no fuzzy matches)');
				return;
			}

			const topResult = fuzzyResults[0];
			console.log(`Fuzzy search top result: ${topResult.item.name} (score: ${topResult.score?.toFixed(3)})`);

			// 3. If top result is good enough, use it
			if (topResult.score !== undefined && topResult.score < FUZZY_AUTO_SELECT_THRESHOLD) {
				const entry = prepareItemForDisplay(topResult.item as WarframeItem);

				if (!entry.name) {
					message.reply(`'${query}' has invalid data.`);
					return;
				}

				message.reply({
					embeds: [getWarframeItemEmbed(message.author, entry)],
				});
				return;
			}

			// 4. Show "Did you mean?" suggestions
			const suggestions = fuzzyResults
				.slice(0, 5)
				.map(r => r.item.name)
				.filter((name): name is string => name !== undefined)
				.join(', ');

			message.reply(`'${query}' not found. Did you mean: ${suggestions}?`);
			console.log(`Suggesting alternatives: ${suggestions}`);
		}
	},
};
