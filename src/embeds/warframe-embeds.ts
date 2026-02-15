import { EmbedBuilder, User, APIEmbedField } from 'discord.js';
import WarframeItem, { DamageTypes, Polarity } from '../interfaces/wf-item';

// Utility: Format damage types into readable string
const formatDamageTypes = (damage: DamageTypes): string | null => {
	const types: string[] = [];
	if (damage.impact) types.push(`Impact: ${damage.impact.toFixed(1)}`);
	if (damage.puncture) types.push(`Puncture: ${damage.puncture.toFixed(1)}`);
	if (damage.slash) types.push(`Slash: ${damage.slash.toFixed(1)}`);
	if (damage.heat) types.push(`Heat: ${damage.heat.toFixed(1)}`);
	if (damage.cold) types.push(`Cold: ${damage.cold.toFixed(1)}`);
	if (damage.electricity) types.push(`Electricity: ${damage.electricity.toFixed(1)}`);
	if (damage.toxin) types.push(`Toxin: ${damage.toxin.toFixed(1)}`);
	if (damage.blast) types.push(`Blast: ${damage.blast.toFixed(1)}`);
	if (damage.radiation) types.push(`Radiation: ${damage.radiation.toFixed(1)}`);
	if (damage.magnetic) types.push(`Magnetic: ${damage.magnetic.toFixed(1)}`);
	if (damage.corrosive) types.push(`Corrosive: ${damage.corrosive.toFixed(1)}`);
	if (damage.viral) types.push(`Viral: ${damage.viral.toFixed(1)}`);
	if (damage.gas) types.push(`Gas: ${damage.gas.toFixed(1)}`);
	if (damage.void) types.push(`Void: ${damage.void.toFixed(1)}`);
	return types.length > 0 ? types.join(' | ') : null;
};

// Utility: Map polarity to display text
const getPolarityText = (polarity: Polarity): string => {
	const polarityMap: Record<string, string> = {
		madurai: 'Madurai (V)',
		vazarin: 'Vazarin (D)',
		naramon: 'Naramon (-)',
		zenurik: 'Zenurik (=)',
		unairu: 'Unairu (R)',
		penjaga: 'Penjaga (Y)',
		umbra: 'Umbra (W)',
		aura: 'Aura',
		universal: 'Universal',
		any: 'Any',
	};
	return polarityMap[polarity] || polarity;
};

// Helper: Add Warframe-specific fields
const addWarframeFields = (embed: EmbedBuilder, item: WarframeItem): EmbedBuilder => {
	const fields: APIEmbedField[] = [];

	if (item.health !== undefined) {
		fields.push({ name: 'Health', value: `${item.health}`, inline: true });
	}
	if (item.shield !== undefined) {
		fields.push({ name: 'Shields', value: `${item.shield}`, inline: true });
	}
	if (item.armor !== undefined) {
		fields.push({ name: 'Armor', value: `${item.armor}`, inline: true });
	}
	if (item.power !== undefined) {
		fields.push({ name: 'Energy', value: `${item.power}`, inline: true });
	}
	if (item.sprintSpeed !== undefined) {
		fields.push({ name: 'Sprint', value: `${item.sprintSpeed}`, inline: true });
	}
	if (item.masteryReq !== undefined) {
		fields.push({ name: 'Mastery', value: `MR ${item.masteryReq}`, inline: true });
	}

	if (item.abilities && item.abilities.length > 0) {
		const abilityList = item.abilities
			.slice(0, 4)
			.map((a, i) => `${i + 1}. ${a.name}`)
			.join('\n');
		fields.push({ name: 'Abilities', value: abilityList, inline: false });
	}

	if (item.passiveDescription) {
		const passive = item.passiveDescription.length > 200
			? item.passiveDescription.substring(0, 197) + '...'
			: item.passiveDescription;
		fields.push({ name: 'Passive', value: passive, inline: false });
	}

	if (fields.length > 0) {
		embed.addFields(fields);
	}
	return embed;
};

// Helper: Add gun (Primary/Secondary) fields
const addGunFields = (embed: EmbedBuilder, item: WarframeItem): EmbedBuilder => {
	const fields: APIEmbedField[] = [];

	if (item.totalDamage !== undefined) {
		fields.push({ name: 'Damage', value: `${item.totalDamage.toFixed(1)}`, inline: true });
	}
	if (item.criticalChance !== undefined) {
		fields.push({ name: 'Crit Chance', value: `${(item.criticalChance * 100).toFixed(1)}%`, inline: true });
	}
	if (item.criticalMultiplier !== undefined) {
		fields.push({ name: 'Crit Multi', value: `${item.criticalMultiplier.toFixed(1)}x`, inline: true });
	}
	if (item.procChance !== undefined) {
		fields.push({ name: 'Status', value: `${(item.procChance * 100).toFixed(1)}%`, inline: true });
	}
	if (item.fireRate !== undefined) {
		fields.push({ name: 'Fire Rate', value: `${item.fireRate.toFixed(2)}/s`, inline: true });
	}
	if (item.magazineSize !== undefined) {
		fields.push({ name: 'Magazine', value: `${item.magazineSize}`, inline: true });
	}
	if (item.reloadTime !== undefined) {
		fields.push({ name: 'Reload', value: `${item.reloadTime.toFixed(1)}s`, inline: true });
	}
	if (item.masteryReq !== undefined) {
		fields.push({ name: 'Mastery', value: `MR ${item.masteryReq}`, inline: true });
	}

	if (item.damage) {
		const damageText = formatDamageTypes(item.damage);
		if (damageText) {
			fields.push({ name: 'Damage Types', value: damageText, inline: false });
		}
	}

	if (fields.length > 0) {
		embed.addFields(fields);
	}
	return embed;
};

// Helper: Add melee fields
const addMeleeFields = (embed: EmbedBuilder, item: WarframeItem): EmbedBuilder => {
	const fields: APIEmbedField[] = [];

	if (item.totalDamage !== undefined) {
		fields.push({ name: 'Damage', value: `${item.totalDamage.toFixed(1)}`, inline: true });
	}
	if (item.criticalChance !== undefined) {
		fields.push({ name: 'Crit Chance', value: `${(item.criticalChance * 100).toFixed(1)}%`, inline: true });
	}
	if (item.criticalMultiplier !== undefined) {
		fields.push({ name: 'Crit Multi', value: `${item.criticalMultiplier.toFixed(1)}x`, inline: true });
	}
	if (item.procChance !== undefined) {
		fields.push({ name: 'Status', value: `${(item.procChance * 100).toFixed(1)}%`, inline: true });
	}
	if (item.fireRate !== undefined) {
		fields.push({ name: 'Attack Speed', value: `${item.fireRate.toFixed(2)}/s`, inline: true });
	}
	if (item.range !== undefined) {
		fields.push({ name: 'Range', value: `${item.range}m`, inline: true });
	}
	if (item.comboDuration !== undefined) {
		fields.push({ name: 'Combo Duration', value: `${item.comboDuration}s`, inline: true });
	}
	if (item.masteryReq !== undefined) {
		fields.push({ name: 'Mastery', value: `MR ${item.masteryReq}`, inline: true });
	}

	if (item.damage) {
		const damageText = formatDamageTypes(item.damage);
		if (damageText) {
			fields.push({ name: 'Damage Types', value: damageText, inline: false });
		}
	}

	if (fields.length > 0) {
		embed.addFields(fields);
	}
	return embed;
};

// Helper: Add mod fields
const addModFields = (embed: EmbedBuilder, item: WarframeItem): EmbedBuilder => {
	const fields: APIEmbedField[] = [];

	if (item.polarity) {
		fields.push({ name: 'Polarity', value: getPolarityText(item.polarity), inline: true });
	}
	if (item.baseDrain !== undefined) {
		fields.push({ name: 'Drain', value: `${item.baseDrain}`, inline: true });
	}
	if (item.fusionLimit !== undefined) {
		fields.push({ name: 'Max Rank', value: `${item.fusionLimit}`, inline: true });
	}
	if (item.rarity) {
		fields.push({ name: 'Rarity', value: item.rarity, inline: true });
	}

	if (item.levelStats && item.levelStats.length > 0) {
		const maxRankStats = item.levelStats[item.levelStats.length - 1];
		if (maxRankStats.stats && maxRankStats.stats.length > 0) {
			const statsText = maxRankStats.stats
				.slice(0, 3)
				.map(s => s.replace(/<[^>]*>?/gm, ''))
				.join('\n');
			fields.push({ name: 'Max Rank Effects', value: statsText, inline: false });
		}
	}

	if (item.drops && item.drops.length > 0) {
		const dropText = item.drops
			.slice(0, 2)
			.map(d => `${d.location} (${d.rarity || 'Unknown'})`)
			.join('\n');
		fields.push({ name: 'Drop Locations', value: dropText, inline: false });
	}

	if (fields.length > 0) {
		embed.addFields(fields);
	}
	return embed;
};

// Helper: Add relic fields
const addRelicFields = (embed: EmbedBuilder, item: WarframeItem): EmbedBuilder => {
	const fields: APIEmbedField[] = [];

	if (item.vaulted !== undefined) {
		fields.push({ name: 'Status', value: item.vaulted ? 'Vaulted' : 'Available', inline: true });
	}

	if (item.rewards && item.rewards.length > 0) {
		const groupedRewards: Record<string, string[]> = {
			Common: [],
			Uncommon: [],
			Rare: [],
		};

		for (const reward of item.rewards) {
			const name = reward.item?.name || 'Unknown';
			const rarity = reward.rarity || 'Common';
			if (groupedRewards[rarity]) {
				groupedRewards[rarity].push(name);
			}
		}

		if (groupedRewards.Common.length > 0) {
			fields.push({ name: 'Common', value: groupedRewards.Common.join('\n'), inline: true });
		}
		if (groupedRewards.Uncommon.length > 0) {
			fields.push({ name: 'Uncommon', value: groupedRewards.Uncommon.join('\n'), inline: true });
		}
		if (groupedRewards.Rare.length > 0) {
			fields.push({ name: 'Rare', value: groupedRewards.Rare.join('\n'), inline: true });
		}
	}

	if (fields.length > 0) {
		embed.addFields(fields);
	}
	return embed;
};

// Helper: Add fish fields (use large image)
const addFishFields = (embed: EmbedBuilder, item: WarframeItem): EmbedBuilder => {
	if (item.imageLink) {
		embed.setImage(item.imageLink);
		embed.setThumbnail(null);
	}

	if (!item.drops || item.drops.length === 0) {
		return embed;
	}

	const fields: APIEmbedField[] = [];
	for (let i = 0; i < Math.min(item.drops.length, 3); i++) {
		const drop = item.drops[i];
		const isShort = drop.location.length < 20;
		fields.push({
			name: drop.location,
			value: `Chance: ${drop.chance}\nRarity: ${drop.rarity || 'Unknown'}`,
			inline: isShort,
		});
	}

	if (fields.length > 0) {
		embed.addFields(fields);
	}
	return embed;
};

// Helper: Add companion (Pets/Sentinels) fields
const addCompanionFields = (embed: EmbedBuilder, item: WarframeItem): EmbedBuilder => {
	const fields: APIEmbedField[] = [];

	if (item.health !== undefined) {
		fields.push({ name: 'Health', value: `${item.health}`, inline: true });
	}
	if (item.shield !== undefined) {
		fields.push({ name: 'Shields', value: `${item.shield}`, inline: true });
	}
	if (item.armor !== undefined) {
		fields.push({ name: 'Armor', value: `${item.armor}`, inline: true });
	}

	if (fields.length > 0) {
		embed.addFields(fields);
	}
	return embed;
};

// Helper: Add resource fields
const addResourceFields = (embed: EmbedBuilder, item: WarframeItem): EmbedBuilder => {
	if (item.drops && item.drops.length > 0) {
		const dropText = item.drops
			.slice(0, 3)
			.map(d => d.location)
			.join('\n');
		embed.addFields({ name: 'Found In', value: dropText, inline: false });
	}
	return embed;
};

// Helper: Add generic fallback fields
const addGenericFields = (embed: EmbedBuilder, item: WarframeItem): EmbedBuilder => {
	const fields: APIEmbedField[] = [];

	if (item.type) {
		fields.push({ name: 'Type', value: item.type, inline: true });
	}
	if (item.tradable !== undefined) {
		fields.push({ name: 'Tradable', value: item.tradable ? 'Yes' : 'No', inline: true });
	}
	if (item.masteryReq !== undefined) {
		fields.push({ name: 'Mastery', value: `MR ${item.masteryReq}`, inline: true });
	}

	if (item.drops && item.drops.length > 0) {
		const dropText = item.drops
			.slice(0, 2)
			.map(d => d.location)
			.join('\n');
		fields.push({ name: 'Drop Locations', value: dropText, inline: false });
	}

	if (fields.length > 0) {
		embed.addFields(fields);
	}
	return embed;
};

// Legacy fish-only embed (deprecated, use getWarframeItemEmbed instead)
const getWarframeFishEmbed = (user: User, warframeItem: WarframeItem): EmbedBuilder => {
	const fields: APIEmbedField[] = [
		{ name: 'Description', value: warframeItem.description || 'No description available' },
	];
	if (warframeItem.drops) {
		for (let index = 0; index < warframeItem.drops.length; index++) {
			const location = warframeItem.drops[index].location;
			const chance = warframeItem.drops[index].chance;
			const rarity = warframeItem.drops[index].rarity;
			if (location.length < 20) {
				fields.push({ name: location, value: `chance: ${chance}\nrarity: ${rarity}`, inline: true });
			}
			else {
				fields.push({ name: location, value: `chance: ${chance}\nrarity: ${rarity}`, inline: false });
			}
			if (index === 2) {
				break;
			}
		}
	}

	return new EmbedBuilder()
		.setColor('#FFD700')
		.setTitle(warframeItem.name)
		.setURL(warframeItem.wikiLink || '')
		.setAuthor({ name: user.username, iconURL: user.displayAvatarURL(), url: `https://${user.username}.com` })
		.setDescription('Category: ' + warframeItem.category)
		.setImage(warframeItem.imageLink || '')
		.addFields(fields)
		.setTimestamp()
		.setFooter({ text: '', iconURL: 'https://p1.hiclipart.com/preview/408/6/534/warframe-lotus-logo-proposal-png-clipart-thumbnail.jpg' });
};

// Main category-aware Warframe item embed builder
const getWarframeItemEmbed = (user: User, item: WarframeItem): EmbedBuilder => {
	const WARFRAME_GOLD = '#FFD700';
	const LOTUS_ICON = 'https://p1.hiclipart.com/preview/408/6/534/warframe-lotus-logo-proposal-png-clipart-thumbnail.jpg';

	const embed = new EmbedBuilder()
		.setColor(WARFRAME_GOLD)
		.setTitle(item.name)
		.setAuthor({
			name: user.username,
			iconURL: user.displayAvatarURL(),
		})
		.setTimestamp()
		.setFooter({
			text: item.category || 'Warframe Item',
			iconURL: LOTUS_ICON,
		});

	if (item.wikiLink) {
		embed.setURL(item.wikiLink);
	}

	if (item.imageLink) {
		embed.setThumbnail(item.imageLink);
	}

	if (item.description) {
		const desc = item.description.length > 300
			? item.description.substring(0, 297) + '...'
			: item.description;
		embed.setDescription(desc);
	}

	// Add category-specific fields
	switch (item.category) {
	case 'Warframes':
	case 'Archwing':
		return addWarframeFields(embed, item);
	case 'Primary':
	case 'Secondary':
	case 'Arch-Gun':
		return addGunFields(embed, item);
	case 'Melee':
	case 'Arch-Melee':
		return addMeleeFields(embed, item);
	case 'Mods':
		return addModFields(embed, item);
	case 'Relics':
		return addRelicFields(embed, item);
	case 'Fish':
		return addFishFields(embed, item);
	case 'Pets':
	case 'Sentinels':
		return addCompanionFields(embed, item);
	case 'Resources':
		return addResourceFields(embed, item);
	default:
		return addGenericFields(embed, item);
	}
};

export {
	getWarframeFishEmbed,
	getWarframeItemEmbed,
};
