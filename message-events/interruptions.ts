// const currencies = new Map('bruh', 'crazy', );
import { Message } from 'discord.js';
import fetch from 'node-fetch';
const foodCategories = ['burger', 'dessert', 'pasta', 'pizza'];
const indianFood = ['biryani', 'butter-chicken', 'dosa', 'idly', 'rice', 'samosa'];
const rolls = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
module.exports = {
	name: 'interruptions',
	async execute(message: Message) {
		if (message.author.bot) return;
		// if (message.author.username.includes('gener')) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('bruh')) {
			console.log(command);
			message.reply('bruh');
			console.log('message sent');
		}
		else if (command.includes('crazy')) {
			console.log(command);
			const x = randomIntFromInterval(1, 10);
			console.log(x);
			if (x <= 6) {
				message.reply('fr');
			}
			else if (x > 6 && x < 9) {
				message.reply('ong');
			}
			else {
				message.reply('for real');
			}
			console.log('message sent');
		}
		else if (command.includes('ping')) {
			console.log(command);
			message.reply('🏓');
			console.log('message sent');
		}
		else if (command.includes('cap')) {
			console.log(command);
			const num = randomIntFromInterval(0, 4);
			let emoji = '🧢';
			switch (num) {
			case 0:
				emoji = '🎓';
				break;
			case 1:
				emoji = '👒';
				break;
			case 2:
				emoji = '🎩';
				break;
			case 3:
				emoji = '🧢';
				break;
			default:
				emoji = '🧢';
				break;
			}
			message.react(emoji);
			console.log('message sent');
		}
		else if (command.includes('daily')) {
			console.log(command);
			message.reply('https://xkcd.com/');
			console.log('message sent');
		}
		else if (command.includes('random')) {
			console.log(command);
			const res = 'https://source.unsplash.com/random/300x200?sig=' + Math.random();
			message.reply(res);
			console.log('message sent, link: ' + res);
			return;
		}
		else if (command.includes('dog')) {
			console.log(command);
			const res = await fetch('https://dog.ceo/api/breeds/image/random').then(response => response.json());
			console.log('dog api status: ' + res.status + ' dog link: ' + res.message);
			message.reply(res.message);
			console.log('message sent');
		}
		else if (command.includes('$hroll')) {
			console.log(command);
			const x = randomIntFromInterval(0, 5);
			console.log(rolls[x]);
			message.react(rolls[x]);
		}
		else if (command.includes('indianfood')) {
			console.log(command.split(' '));
			message.reply(indianFood.join(', '));
		}
		else if (command.includes('foodcategories')) {
			console.log(command);
			message.reply(foodCategories.join(', '));
		}
		else if (command.includes('cat')) {
			console.log(command);
			const res = await fetch('https://aws.random.cat/meow').then(response => response.json());
			console.log(res.file);
			message.reply(res.file);
			console.log('message sent');
		}
		else if (command.includes('ski')) {
			message.reply('https://cdn.discordapp.com/attachments/945820129457995836/950996673117704192/IMG_6429.jpg');
		}
		else if (command.includes('blunt')) {
			message.reply('https://media.discordapp.net/attachments/945820129457995836/984260637293170768/IMG_6613.jpg');
		}
	},
};

function randomIntFromInterval(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1) + min);
}
