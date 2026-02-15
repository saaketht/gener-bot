import { SlashCommandBuilder } from 'discord.js';
import { Command, DiscordClient } from '../../types';
import { GameEngine } from '../../game/GameEngine';
import { GameStorage } from '../../game/GameStorage';
import { createStarterWorld } from '../../game/WorldTemplates';
import { createWelcomeEmbed } from '../../ui/GameEmbeds';
import { GameState } from '../../game/types';
import logger from '../../utils/logger';
import path from 'path';

export const gameStorage = new GameStorage(path.join(process.cwd(), 'data', 'games'));

const adventureCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('adventure')
		.setDescription('Start a multiplayer text adventure in a new thread!'),

	async execute(client, interaction) {
		if (!interaction.channel) {
			await interaction.reply({ content: 'Cannot start adventure here.', ephemeral: true });
			return;
		}

		// Check if we can create a thread
		if (!('threads' in interaction.channel)) {
			await interaction.reply({ content: 'Adventures can only be started in text channels.', ephemeral: true });
			return;
		}

		await interaction.deferReply();

		try {
			// Create the thread
			const thread = await interaction.channel.threads.create({
				name: `⚔️ ${interaction.user.username}'s Adventure`,
				autoArchiveDuration: 1440, // 24 hours
				reason: 'Text adventure game',
			});

			// Build initial game state
			const worldMap = createStarterWorld();
			const now = Date.now();
			const state: GameState = {
				gameId: `game_${now}`,
				threadId: thread.id,
				createdAt: now,
				lastActivity: now,
				party: {
					mode: 'solo',
					members: {
						[interaction.user.id]: {
							userId: interaction.user.id,
							username: interaction.user.username,
							stats: {
								health: 100,
								maxHealth: 100,
								level: 1,
								experience: 0,
								gold: 10,
							},
							inventory: [],
							equipped: {},
							questFlags: [],
							achievements: [],
						},
					},
					turnOrder: [interaction.user.id],
					currentTurn: 0,
					actionCooldown: 3000,
					lastActionTime: now,
				},
				currentRoomId: 'tavern',
				visitedRooms: ['tavern'],
				narrativeSummary: '',
				currentScene: null,
				recentActions: [],
				worldMap,
				globalFlags: [],
			};

			// Create engine and store in client.activeGames
			const engine = new GameEngine(state);
			(client as DiscordClient).activeGames.set(thread.id, engine);
			gameStorage.saveGame(state);

			// Send welcome embed to thread
			const startRoom = worldMap['tavern'];
			const embed = createWelcomeEmbed(startRoom);
			await thread.send({ embeds: [embed] });

			// Reply in original channel
			await interaction.editReply(`Adventure started! Head to ${thread} to begin your quest.`);

			logger.info(`Adventure started by ${interaction.user.username} in thread ${thread.id}`);
		} catch (error) {
			logger.error('Failed to start adventure:', error);
			await interaction.editReply('Failed to start adventure. Please try again.');
		}
	},
};

export default adventureCommand;
