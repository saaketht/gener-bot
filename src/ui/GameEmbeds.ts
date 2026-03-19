import { EmbedBuilder } from 'discord.js';
import { GameState, Room, Player, GameResult } from '../game/types';

export function createGameEmbed(state: GameState, room: Room, result?: GameResult): EmbedBuilder {
	const firstPlayer = Object.values(state.party.members)[0];
	const embed = new EmbedBuilder()
		.setTitle(`📍 ${room.name}`)
		.setColor(firstPlayer ? getHealthColor(firstPlayer) : '#3498db')
		.setTimestamp();

	if (result) {
		embed.setDescription(result.message);
	}
	else {
		embed.setDescription(buildRoomDescription(room));
	}

	// Player stats
	if (firstPlayer) {
		const healthBar = createHealthBar(firstPlayer.stats.health, firstPlayer.stats.maxHealth);
		embed.addFields({
			name: `${firstPlayer.username} (Lv${firstPlayer.stats.level})`,
			value: `${healthBar}\n💰 ${firstPlayer.stats.gold} gold | ⭐ ${firstPlayer.stats.experience} XP`,
			inline: false,
		});
	}

	// Stat changes
	if (result?.statChanges && result.statChanges.length > 0) {
		const changes = result.statChanges.map(sc =>
			`${sc.stat}: ${sc.change > 0 ? '+' : ''}${sc.change}`,
		).join(' | ');
		embed.addFields({ name: '📊 Changes', value: changes, inline: false });
	}

	// Items gained/lost
	if (result?.itemsGained && result.itemsGained.length > 0) {
		embed.addFields({ name: '🎒 Gained', value: result.itemsGained.map(i => i.name).join(', '), inline: true });
	}
	if (result?.itemsLost && result.itemsLost.length > 0) {
		embed.addFields({ name: '📤 Lost', value: result.itemsLost.map(i => i.name).join(', '), inline: true });
	}

	const partySize = Object.keys(state.party.members).length;
	embed.setFooter({ text: `${state.party.mode} mode | ${partySize} player${partySize !== 1 ? 's' : ''}` });

	return embed;
}

export function createPlayerListEmbed(state: GameState): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle('👥 Party Members')
		.setColor('#3498db');

	let description = `**Mode:** ${state.party.mode}\n\n`;

	for (const player of Object.values(state.party.members)) {
		const healthBar = createHealthBar(player.stats.health, player.stats.maxHealth);
		description += `**${player.username}** (Lv${player.stats.level})\n`;
		description += `${healthBar}\n`;
		description += `💰 ${player.stats.gold} | ⭐ ${player.stats.experience} XP\n`;
		if (player.equipped.weapon) description += `⚔️ ${player.equipped.weapon.name}\n`;
		if (player.equipped.armor) description += `🛡️ ${player.equipped.armor.name}\n`;
		description += '\n';
	}

	embed.setDescription(description);

	if (state.party.mode === 'turn-based' && state.party.turnOrder.length > 0) {
		const currentId = state.party.turnOrder[state.party.currentTurn];
		const currentPlayer = state.party.members[currentId];
		if (currentPlayer) {
			embed.setFooter({ text: `Current turn: ${currentPlayer.username}` });
		}
	}

	return embed;
}

export function createLevelUpEmbed(player: Player): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle('🎉 LEVEL UP!')
		.setDescription(`**${player.username}** reached level **${player.stats.level}**!`)
		.addFields(
			{ name: 'Max Health', value: `+10 (now ${player.stats.maxHealth})`, inline: true },
			{ name: 'HP', value: 'Fully restored!', inline: true },
		)
		.setColor('#FFD700');
}

export function createWelcomeEmbed(room: Room): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle('⚔️ A New Adventure Begins!')
		.setDescription(buildRoomDescription(room))
		.setColor('#2ecc71')
		.addFields(
			{
				name: 'Quick Start',
				value: [
					'Move: `north`, `south`, `east`, `west` (or `n/s/e/w`)',
					'Fight: `attack <enemy>`',
					'Items: `get <item>`, `use <item>`, `equip <item>`',
					'Info: `look`, `inventory`, `stats`',
					'Or just describe what you want to do!',
				].join('\n'),
				inline: false,
			},
			{
				name: 'Multiplayer',
				value: [
					'`!join` — Join this adventure',
					'`!party` — See party members',
					'`!mode solo|turn|coop` — Change party mode',
					'`!quit` — Leave the adventure',
				].join('\n'),
				inline: false,
			},
		);
}

function buildRoomDescription(room: Room): string {
	let desc = room.description + '\n\n';

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
			desc += `*Present: ${others.map(n => n.name).join(', ')}*\n`;
		}
	}

	return desc;
}

function createHealthBar(current: number, max: number): string {
	const percentage = max > 0 ? current / max : 0;
	const barLength = 10;
	const filled = Math.round(percentage * barLength);
	const empty = barLength - filled;
	return `❤️ ${'█'.repeat(filled)}${'░'.repeat(empty)} ${current}/${max}`;
}

function getHealthColor(player: Player): `#${string}` {
	const percentage = player.stats.maxHealth > 0 ? player.stats.health / player.stats.maxHealth : 0;
	if (percentage > 0.7) return '#2ecc71';
	if (percentage > 0.3) return '#f39c12';
	return '#e74c3c';
}
