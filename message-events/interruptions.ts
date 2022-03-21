// const currencies = new Map('bruh', 'crazy', );
import fetch from 'node-fetch';
const foodCategories = ['burger', 'dessert', 'pasta', 'pizza'];
const indianFood = ['biryani', 'butter-chicken', 'dosa', 'idly', 'rice', 'samosa'];
module.exports = {
	name: 'interruptions',
	async execute(message: { author: { bot: any; }; content: string; reply: (arg0: string) => void; }) {
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
		else if (command.includes('cat')) {
			console.log(command);
			const res = await fetch('https://aws.random.cat/meow').then(response => response.json());
			console.log(res.file);
			message.reply(res.file);
			console.log('message sent');
		}
		else if (command.includes('ping')) {
			console.log(command);
			message.reply('pong');
			console.log('message sent');
		}
		else if (command.includes('cap')) {
			console.log(command);
			message.reply('🧢');
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
			const x = randomIntFromInterval(1, 6);
			console.log(x);
			message.reply('roll result: ' + x);
		}
		else if (command.includes('indianfood')) {
			console.log(command.split(' '));
			message.reply(indianFood.join(', '));
		}
		else if (command.includes('foodcategories')) {
			console.log(command);
			message.reply(foodCategories.join(', '));
		}
		else if (command.includes('furrytail')) {
			message.reply('https://cdn.discordapp.com/attachments/544570497791295535/554174044551905290/video.mov');
		}
		else if (command.includes('ski')) {
			message.reply('https://cdn.discordapp.com/attachments/945820129457995836/950996673117704192/IMG_6429.jpg');
		}
	},
};

function randomIntFromInterval(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1) + min);
}