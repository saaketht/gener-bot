// const currencies = new Map('bruh', 'crazy', );
const fetch = require('node-fetch');

module.exports = {
	name: 'interruptions',
	async execute(message) {
		if (message.author.bot) return;
		if (message.author.username.includes('gener')) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('bruh')) {
			console.log(command.split(' '));
			await message.reply('bruh');
		}
		else if (command.includes('crazy')) {
			console.log(command.split(' '));
			const x = randomIntFromInterval(1, 3);
			if (x == 1) {
				await message.reply('for real');
			}
			else if (x == 2) {
				await message.reply('ong');
			}
			else {
				await message.reply('fr');
			}
		}
		else if (command.includes('cat')) {
			console.log(command.split(' '));
			const { file } = await fetch('https://aws.random.cat/meow').then(response => response.json());
			console.log(file);
			await message.reply(file);
		}
		else if (command.includes('ping')) {
			console.log(command.split(' '));
			await message.reply('pong');
		}
		else if (command.includes('cap')) {
			console.log(command.split(' '));
			await message.reply('🧢');
		}
		else if (command.includes('daily')) {
			await message.reply('https://xkcd.com/');
		}
	},
};

function randomIntFromInterval(min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min);
}