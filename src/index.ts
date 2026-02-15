/* eslint-disable @typescript-eslint/no-unused-vars */
// import elements/types
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { DatabaseRepository, Command, DiscordClient } from './types';
import { readCommands, readEvents, readMessageEvents } from './utils/loader';
// music imports
/*
import { MusicPlayer } from './music/MusicPlayer';
import { Ping } from './music/Ping';
import { getConfig, setConfig } from './music/Config';
import { getCmd, getArg, removeLinkMarkdown, prefixify } from './music/Utils';
import { Config } from './music/Types';
*/
// import modules
import Items from 'warframe-items';
import Fuse from 'fuse.js';
import dotenv from 'dotenv';
import http from 'http';
import * as chalk from 'chalk';
import * as fs from 'fs';
import path from 'path';
import { GameEngine } from './game/GameEngine';
import { GameStorage } from './game/GameStorage';
dotenv.config();

// TODO: fix abort controller for streams
// import foo = require('node-abort-controller');
// global.AbortController = foo.AbortController;

// create a new database instance
export type GuildID = string;
// export const MusicPlayers = new Collection<GuildID, MusicPlayer>();

// create a new client instance
const client: DiscordClient = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageTyping,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent,
	]
}) as DiscordClient;
// create a new collection for commands
client.commands = new Collection<string, Command>();
// active adventure games registry (shared via client object to avoid module duplication)
client.activeGames = new Map();

// Restore saved adventure games from disk
const _gameStorage = new GameStorage(path.join(process.cwd(), 'data', 'games'));
const savedGameIds = _gameStorage.listGames();
for (const threadId of savedGameIds) {
	try {
		const state = _gameStorage.loadGame(threadId);
		if (state) {
			client.activeGames.set(threadId, new GameEngine(state));
		}
	} catch (err) {
		console.error(`[startup] Failed to restore game ${threadId}:`, err);
	}
}
if (savedGameIds.length > 0) {
	console.log(`Restored ${client.activeGames.size} adventure games from disk.`);
}

// Initialize Items object with ALL category
const itemObj = new Items({ category: ['All'] });

// read in message event files
readMessageEvents().then((messageEvents) => {
	// listener for message creation events
	client.on('messageCreate', async message => {
		if (message.author.bot) return;
		// iterate through message events and execute them
		for (const messageEvent of messageEvents) {
			try {
				await messageEvent.execute(message);
			} catch (err) {
				console.error(`[messageCreate] error in ${messageEvent.name}:`, err);
			}
		}
	});
	// log number of message events were loaded
	console.log(`Loaded ${messageEvents.length} message events.`);
});

// read in command files
readCommands().then((commands) => {
	// iterate through commands and set them to the client
	commands.forEach((cmd: Command) => {
		if (client && client.commands) client.commands.set(cmd.data.name, cmd);
	});
	console.log(`Loaded ${client.commands.size} commands.`);

});

// read in event files
readEvents().then((events) => {
	events.forEach((event) => {
		if (event.once) {
			client.once(event.name, (...args: unknown[]) => event.execute(...args));
		}
		else {
			client.on(event.name, (...args: unknown[]) => event.execute(...args));
		}
	});
	console.log(`Loaded ${events.length} passive events.`);
});

// log port and print to web dyno port cause why not?
const PORT = process.env.PORT || 6776;
http.createServer(function(req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.write('|||||||||||||||||||||||||||||||||||||||||||||||||\n');
	res.write('generBot is up and running!\n');
	res.write('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
	res.end();
}).listen(PORT);
console.log(`Server listening on ${PORT}`);

//	Login to Discord with your client's token
client.login(process.env.token);
