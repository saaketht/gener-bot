// require('module-alias/register');
// Require the necessary discord.js classes
const http = require('http');
const fs = require('fs');
const prism = require('prism-media');
// import environment variables
require('dotenv').config();
// import required elements
const {
	NoSubscriberBehavior,
	StreamType,
	createAudioPlayer,
	createAudioResource,
	entersState,
	AudioPlayerStatus,
	VoiceConnectionStatus,
	joinVoiceChannel,
} = require('@discordjs/voice');
const { Client, VoiceChannel ,Collection, Intents } = require('discord.js');
const token = process.env.token;
const device = process.env.device;
const type = process.env.type;
const maxTransmissionGap = process.env.maxTransmissionGap;
// const config = require('./config.json');
// require('./config.json');
const myIntents = new Intents();
myIntents.add(Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_TYPING);

// audio handling
const player = createAudioPlayer({
	behaviors: {
		noSubscriber: NoSubscriberBehavior.Play,
		maxMissedFrames: Math.round(maxTransmissionGap / 20),
	},
});

player.on('stateChange', (oldState, newState) => {
	if (oldState.status === AudioPlayerStatus.Idle && newState.status === AudioPlayerStatus.Playing) {
		console.log('Playing audio output on audio player');
	} else if (newState.status === AudioPlayerStatus.Idle) {
		// console.log('Playback has stopped. Attempting to restart.');
		// attachRecorder();
	}
});

function attachRecorder() {
	player.play(
		createAudioResource(
			new prism.FFmpeg({
				args: [
					'-analyzeduration',
					'0',
					'-loglevel',
					'0',
					'-f',
					type,
					'-i',
					type === 'dshow' ? `audio=${device}` : device,
					'-acodec',
					'libopus',
					'-f',
					'opus',
					'-ar',
					'48000',
					'-ac',
					'2',
				],
			}),
			{
				inputType: StreamType.OggOpus,
			},
		),
	);
	console.log('Attached recorder - ready to go!');
}

async function connectToChannel(channel) {
	const connection = joinVoiceChannel({
		channelId: channel.id,
		guildId: channel.guild.id,
		adapterCreator: channel.guild.voiceAdapterCreator,
	});
	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
		return connection;
	} catch (error) {
		connection.destroy();
		throw error;
	}
}

// Create a new client instance
const client = new Client({ intents: myIntents });

const PORT = process.env.PORT || 6565;
http.createServer(function(req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.write('|||||||||||||||||||||||||||||||||||||||||||||||||\n');
	res.write('generBot is up and running!\n');
	res.write('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
	res.end();
}).listen(PORT);
console.log(`Server listening on ${PORT}`);

// read in command files
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	// Set a new item in the Collection
	// With the key as the command name and the value as the exported module
	client.commands.set(command.data.name, command);
}

client.on('ready', async () => {
	attachRecorder();
});

// read in event files
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
	const event = require(`./events/${file}`);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	}
	else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}


// read in message event files
const messageFiles = fs.readdirSync('./message-events').filter(file => file.endsWith('.js'));
for (const file of messageFiles) {
	const messageEvent = require(`./message-events/${file}`);
	client.on('messageCreate', async message => {
		if (message.author.bot) return;
		//	console.log(message.content);
		messageEvent.execute(message);
	});
}

/* const voiceFiles = fs.readdirSync('./voice-events').filter(file => file.endsWith('.js'));
for (const file of voiceFiles) {
	const voiceEvent = require(`./voice-events/${file}`);
	client.on(voiceEvent.name, (...args) => voiceEvent.execute(...args));
} */

// handles slash commands
client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;
	const command = client.commands.get(interaction.commandName);
	if (!command) return;
	try {
		await command.execute(interaction);
	}
	catch (error) {
		console.error(error);
		await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
});

// single event listeners for all state changes **MAY CHANGE
/* connection.on('stateChange', (oldState, newState) => {
	console.log(`Connection transitioned from ${oldState.status} to ${newState.status}`);
});

player.on('stateChange', (oldState, newState) => {
	console.log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);
}); */

client.on('messageCreate', async (message) => {
	if (!message.guild) return;
	if (message.content === '-join') {
		const channel = message.member?.voice.channel;
		console.log(message.member?.voice);
		if (channel) {
			try {
				const connection = await connectToChannel(channel);
				connection.subscribe(player);
				await message.reply('Playing now!');
			} catch (error) {
				console.error(error);
			}
		} else {
			await message.reply('Join a voice channel then try again!');
		}
	} 
});

// Login to Discord with your client's token
client.login(token);