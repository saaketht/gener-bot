/* eslint-disable @typescript-eslint/no-unused-vars */
import {
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	entersState,
	StreamType,
	AudioPlayerStatus,
	VoiceConnectionStatus,
	getVoiceConnection,
	NoSubscriberBehavior,
	VoiceConnection,
} from '@discordjs/voice';
// import elements/types
import { Client, Collection, Intents, VoiceBasedChannel, VoiceChannel } from 'discord.js';
import { DatabaseRepository, Command, DiscordClient } from './@types/bot';
import { readCommands, readEvents, readMessageEvents } from './utils/utils';
import { createDiscordJSAdapter } from './adapter';
// import modules
import MongoDb from './mongo';
import dotenv from 'dotenv';
import http from 'http';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as fs from 'fs';
dotenv.config();

const player = createAudioPlayer({
	behaviors: {
		noSubscriber: NoSubscriberBehavior.Pause,
	},
});

function playSong() {
	const resource = createAudioResource('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', {
		inputType: StreamType.Arbitrary,
	});

	player.play(resource);

	return entersState(player, AudioPlayerStatus.Playing, 5e3);
}

async function connectToChannel(channel: VoiceBasedChannel) {
	const connection = joinVoiceChannel({
		channelId: channel.id,
		guildId: channel.guild.id,
		adapterCreator: channel.guild.voiceAdapterCreator,
	});


	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 30e3);

		return connection;
	}
	catch (error) {
		connection.destroy();
		throw error;
	}
}

const MONGO_URI = 'mongodb+srv://' + process.env.MONGO_DB_USER + ':' + process.env.MONGO_DB_PASSWORD + '@genbot.vslua.mongodb.net/myFirstDatabase?retryWrites=true&w=majority';
const mongo: DatabaseRepository = new MongoDb(MONGO_URI);

const myIntents = new Intents();
myIntents.add(Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_TYPING);

// create a new client instance
const client: DiscordClient = new Client({ intents: myIntents }) as DiscordClient;
client.commands = new Collection<string, Command>();
client.db = mongo;

// read in command files
readCommands().then((commands) => {
	commands.forEach((cmd: Command) => {
		if (client && client.commands) client.commands.set(cmd.data.name, cmd);
	});
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
	console.log(`Loaded ${events.length} events.`);
});

// read in message event files
readMessageEvents().then((messageEvents) => {
	client.on('messageCreate', async message => {
		messageEvents.forEach((messageEvent) => {
			if (message.author.bot) return;
			//	console.log(message.content);
			messageEvent.execute(message);
		});
	});
	console.log(`Loaded ${messageEvents.length} events.`);
});

// log port and print to web dyno port cause why not?
const PORT = process.env.PORT || 6575;
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

client.on('ready', async () => {
	try {
		await playSong();
		console.log('Song is ready to play!');
	}
	catch (error) {
		console.error(error);
	}
});

client.on('messageCreate', async (message) => {
	if (!message.guild) return;

	const channel = message.member?.voice.channel;
	if (message.content === '-join') {
		if (channel) {
			try {
				const connection = await connectToChannel(channel);
				connection.subscribe(player);
				message.reply('Playing now!');
			}
			catch (error) {
				console.error(error);
			}
		}
		else {
			message.reply('Join a voice channel then try again!');
		}
	}
	else if (message.content === '-exit') {
		if (channel) {
			try {
				const connection = getVoiceConnection(channel.guild.id);
				if (connection) {
					connection.destroy();
				}
			}
			catch (error) {
				console.error(error);
			}
		}
	}
});

//	read in command files **DEPRECATED METHOD**
/*	client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.ts'));
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	// Set a new item in the Collection
	// With the key as the command name and the value as the exported module
	client.commands.set(command.data.name, command);
}	*/

//	read in event files **DEPRECATED METHOD**
/*	const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
	const event = require(`./events/${file}`);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	}
	else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}	*/

//	read in voice files **DEPRECATED METHOD**
/* 	const voiceFiles = fs.readdirSync('./voice-events').filter(file => file.endsWith('.js'));
for (const file of voiceFiles) {
	const voiceEvent = require(`./voice-events/${file}`);
	client.on(voiceEvent.name, (...args) => voiceEvent.execute(...args));
}	*/

// read in message event files
/* const messageFiles = fs.readdirSync('./message-events').filter(file => file.endsWith('.js'));
console.log('loaded messageFiles: ' + messageFiles.join(', '));
for (const file of messageFiles) {
	const messageEvent = require(`./message-events/${file}`);
	client.on('messageCreate', async message => {
		if (message.author.bot) return;
		//	console.log(message.content);
		messageEvent.execute(message);
	});
}	*/