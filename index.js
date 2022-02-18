// Require the necessary discord.js classes
const http = require('http');
const fs = require('fs');
// import environment variables
require('dotenv').config();
// import required elements
const { Client, Collection, Intents } = require('discord.js');
const token = process.env.token;
// require('./config.json');
const myIntents = new Intents();
myIntents.add(Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_TYPING);


// Create a new client instance
const client = new Client({ intents: myIntents });

const PORT = process.env.PORT || 6565;
http.createServer(function(req, res) {
	res.end();
}).listen(PORT);

// read in command files
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	// Set a new item in the Collection
	// With the key as the command name and the value as the exported module
	client.commands.set(command.data.name, command);
}

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

// Login to Discord with your client's token
client.login(token);