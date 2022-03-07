// const currencies = new Map('bruh', 'crazy', );
const fetch = require('node-fetch');

module.exports = {
	name: 'interruptions',
	async execute(message) {
		if (message.author.bot) return;
		// if (message.author.username.includes('gener')) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('bruh')) {
			console.log(command.split(' '));
			await message.reply('bruh');
			console.log('message sent');
		}
		else if (command.includes('crazy')) {
			console.log(command.split(' '));
			const x = randomIntFromInterval(1, 10);
			if (x <= 6) {
				await message.reply('fr');
			}
			else if (x > 6 && x < 8) {
				await message.reply('ong');
			}
			else {
				await message.reply('fr');
			}
			console.log('message sent');
		}
		else if (command.includes('cat')) {
			console.log(command.split(' '));
			const res = await fetch('https://aws.random.cat/meow').then(response => response.json());
			console.log(res.file);
			await message.reply(res.file);
			console.log('message sent');
		}
		else if (command.includes('ping')) {
			console.log(command.split(' '));
			await message.reply('pong');
			console.log('message sent');
		}
		else if (command.includes('cap')) {
			console.log(command.split(' '));
			await message.reply('🧢');
			console.log('message sent');
		}
		else if (command.includes('daily')) {
			console.log(command.split(' '));
			await message.reply('https://xkcd.com/');
			console.log('message sent');
		}
		else if (command.includes('random')) { 
			console.log(command.split(' '));
			await message.reply('https://source.unsplash.com/random/300x200?sig=' + Math.random());
			console.log('message sent');
		}
		else if (command.includes('dog')) {
			console.log(command.split(' '));
			const res = await fetch('https://dog.ceo/api/breeds/image/random').then(response => response.json());
			console.log('dog api status: ' + res.status + ' dog link: ' + res.message);
			await message.reply(res.message);
			console.log('message sent');
		}
		else if (command.includes('dog')) { 
			console.log(command.split(' '));

		}
	},
};

function randomIntFromInterval(min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min);
}