import { Message, GuildTextBasedChannel } from 'discord.js';
import { MessageEvent, DiscordClient } from '../../types';
import { GameEngine } from '../../game/GameEngine';
import { GameStorage } from '../../game/GameStorage';
import { MultiplayerManager } from '../../game/MultiplayerManager';
import { createGameEmbed, createPlayerListEmbed, createLevelUpEmbed } from '../../ui/GameEmbeds';
import { PartyMode } from '../../game/types';
import { rateLimiter } from '../../utils/rateLimiter';
import logger from '../../utils/logger';
import path from 'path';

const multiplayerManager = new MultiplayerManager();
const gameStorage = new GameStorage(path.join(process.cwd(), 'data', 'games'));

function getActiveGames(message: Message): Map<string, GameEngine> {
	return (message.client as DiscordClient).activeGames;
}

const adventureHandler: MessageEvent = {
	name: 'adventure-handler',

	async execute(message: Message): Promise<void> {
		if (message.author.bot) return;
		if (!message.channel.isSendable()) return;

		const isThread = message.channel.isThread();
		if (!isThread) return;

		const activeGames = getActiveGames(message);
		const engine = activeGames.get(message.channel.id);
		if (!engine) return;

		const content = message.content.trim();
		const lower = content.toLowerCase();

		// Meta commands
		if (lower === '!join') { await handleJoin(message, engine); return; }
		if (lower === '!party') { await handleParty(message, engine); return; }
		if (lower === '!quit') { await handleQuit(message, engine); return; }
		if (lower.startsWith('!mode ')) { await handleMode(message, engine); return; }

		// Rate limit game actions: 15 per minute
		if (!rateLimiter(message.author.id, 'adventure', 15, 60000)) {
			await message.react('⏳');
			return;
		}

		// Check if player can act
		const state = engine.getState();
		const canAct = multiplayerManager.canPlayerAct(state, message.author.id);
		if (!canAct.canAct) {
			if (canAct.reason) {
				const reply = await message.reply(canAct.reason);
				setTimeout(() => reply.delete().catch(() => { /* ignore */ }), 4000);
			} else {
				await message.react('⏳');
			}
			return;
		}

		// Process game action
		await message.channel.sendTyping();

		try {
			const result = await engine.processAction(message.author.id, content);

			// Update timestamps
			state.lastActivity = Date.now();
			state.party.lastActionTime = Date.now();

			// Save state
			gameStorage.saveGame(state);

			// Send result embed
			const room = engine.getCurrentRoom();
			const embed = createGameEmbed(state, room, result);
			await message.channel.send({ embeds: [embed] });

			// Turn advancement
			if (state.party.mode === 'turn-based') {
				multiplayerManager.advanceTurn(state);
				const nextPlayer = multiplayerManager.getCurrentPlayer(state);
				if (nextPlayer) {
					await message.channel.send(`<@${nextPlayer.userId}>, it's your turn!`);
				}
				gameStorage.saveGame(state);
			}

			// Level up check
			if (engine.checkLevelUp(message.author.id)) {
				const player = engine.getPlayer(message.author.id);
				if (player) {
					const levelEmbed = createLevelUpEmbed(player);
					await message.channel.send({ embeds: [levelEmbed] });
					gameStorage.saveGame(state);
				}
			}
		} catch (error) {
			logger.error('Error processing adventure action:', error);
			await message.reply('Something went wrong. Try again.');
		}
	},
};

async function handleJoin(message: Message, engine: GameEngine): Promise<void> {
	const state = engine.getState();
	const channel = message.channel as GuildTextBasedChannel;

	if (state.party.members[message.author.id]) {
		await message.reply('You\'re already in this adventure!');
		return;
	}

	multiplayerManager.addPlayer(state, message.author.id, message.author.username);
	gameStorage.saveGame(state);

	const partySize = multiplayerManager.getPartySize(state);
	await channel.send(
		`**${message.author.username}** joined the adventure! (${partySize} player${partySize !== 1 ? 's' : ''})\n` +
		`Party mode: **${state.party.mode}**`
	);

	if (state.party.mode === 'turn-based') {
		const current = multiplayerManager.getCurrentPlayer(state);
		if (current) {
			await channel.send(`It's ${current.username}'s turn.`);
		}
	}

	logger.info(`${message.author.username} joined adventure in ${message.channel.id}`);
}

async function handleParty(message: Message, engine: GameEngine): Promise<void> {
	const state = engine.getState();
	const embed = createPlayerListEmbed(state);
	await message.reply({ embeds: [embed] });
}

async function handleQuit(message: Message, engine: GameEngine): Promise<void> {
	const state = engine.getState();
	const activeGames = getActiveGames(message);
	const channel = message.channel as GuildTextBasedChannel;

	if (!state.party.members[message.author.id]) {
		await message.reply('You\'re not in this adventure.');
		return;
	}

	multiplayerManager.removePlayer(state, message.author.id);
	await channel.send(`**${message.author.username}** left the adventure.`);

	if (multiplayerManager.getPartySize(state) === 0) {
		activeGames.delete(message.channel.id);
		gameStorage.deleteGame(state.threadId);
		await channel.send('All players have left. Adventure ended.');

		// Archive the thread
		if (message.channel.isThread()) {
			await message.channel.setArchived(true).catch(() => { /* ignore */ });
		}
	} else {
		gameStorage.saveGame(state);
	}

	logger.info(`${message.author.username} quit adventure in ${message.channel.id}`);
}

async function handleMode(message: Message, engine: GameEngine): Promise<void> {
	const state = engine.getState();

	if (!state.party.members[message.author.id]) {
		await message.reply('You\'re not in this adventure.');
		return;
	}

	const modeArg = message.content.trim().split(/\s+/)[1]?.toLowerCase();
	const modeMap: Record<string, PartyMode> = {
		solo: 'solo',
		turn: 'turn-based',
		coop: 'collaborative',
	};

	const mode = modeMap[modeArg];
	if (!mode) {
		await message.reply('Usage: `!mode solo`, `!mode turn`, or `!mode coop`');
		return;
	}

	multiplayerManager.setMode(state, mode);
	gameStorage.saveGame(state);

	const descriptions: Record<string, string> = {
		solo: 'Solo mode (single player)',
		'turn-based': 'Turn-based (players take turns)',
		collaborative: 'Collaborative (anyone can act, 3s cooldown)',
	};

	await message.reply(`Party mode changed to: **${descriptions[mode]}**`);

	if (mode === 'turn-based') {
		const current = multiplayerManager.getCurrentPlayer(state);
		if (current) {
			await (message.channel as GuildTextBasedChannel).send(`<@${current.userId}>, it's your turn!`);
		}
	}
}

export default adventureHandler;
