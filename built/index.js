"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-unused-vars */
const voice_1 = require("@discordjs/voice");
// import elements/types
const discord_js_1 = require("discord.js");
const utils_1 = require("./utils/utils");
// import modules
const mongo_1 = __importDefault(require("./mongo"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
dotenv_1.default.config();
const player = (0, voice_1.createAudioPlayer)({
    behaviors: {
        noSubscriber: voice_1.NoSubscriberBehavior.Pause,
    },
});
function playSong() {
    const resource = (0, voice_1.createAudioResource)('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', {
        inputType: voice_1.StreamType.Arbitrary,
    });
    player.play(resource);
    return (0, voice_1.entersState)(player, voice_1.AudioPlayerStatus.Playing, 5e3);
}
async function connectToChannel(channel) {
    const connection = (0, voice_1.joinVoiceChannel)({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });
    try {
        await (0, voice_1.entersState)(connection, voice_1.VoiceConnectionStatus.Ready, 30e3);
        return connection;
    }
    catch (error) {
        connection.destroy();
        throw error;
    }
}
const MONGO_URI = 'mongodb+srv://' + process.env.MONGO_DB_USER + ':' + process.env.MONGO_DB_PASSWORD + '@genbot.vslua.mongodb.net/myFirstDatabase?retryWrites=true&w=majority';
const mongo = new mongo_1.default(MONGO_URI);
const myIntents = new discord_js_1.Intents();
myIntents.add(discord_js_1.Intents.FLAGS.GUILDS, discord_js_1.Intents.FLAGS.GUILD_MESSAGES, discord_js_1.Intents.FLAGS.GUILD_MESSAGE_TYPING);
// create a new client instance
const client = new discord_js_1.Client({ intents: myIntents });
client.commands = new discord_js_1.Collection();
client.db = mongo;
// read in command files
(0, utils_1.readCommands)().then((commands) => {
    commands.forEach((cmd) => {
        if (client && client.commands)
            client.commands.set(cmd.data.name, cmd);
    });
});
// read in event files
(0, utils_1.readEvents)().then((events) => {
    events.forEach((event) => {
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        }
        else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    });
    console.log(`Loaded ${events.length} passive events.`);
});
// read in message event files
(0, utils_1.readMessageEvents)().then((messageEvents) => {
    client.on('messageCreate', async (message) => {
        messageEvents.forEach((messageEvent) => {
            if (message.author.bot)
                return;
            //	console.log(message.content);
            messageEvent.execute(message);
        });
    });
    console.log(`Loaded ${messageEvents.length} message events.`);
});
// log port and print to web dyno port cause why not?
const PORT = process.env.PORT || 6575;
http_1.default.createServer(function (req, res) {
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
    if (!message.guild)
        return;
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
                const connection = (0, voice_1.getVoiceConnection)(channel.guild.id);
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
