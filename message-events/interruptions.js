// const currencies = new Map('bruh', 'crazy', );
const fetch = require('node-fetch');

module.exports = {
	name: 'interruptions',
	execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('bruh')) {
			console.log(command.split(' '));
			message.reply('bruh');
		}
		else if (command.includes('crazy')) {
			console.log(command.split(' '));
			const x = randomIntFromInterval(1, 3);
			if (x == 1) {
				message.reply('for real');
			}
			else if (x == 2) {
				message.reply('ong');
			}
			else {
				message.reply('fr');
			}
		}
		else if (command.includes('cat')) {
			console.log(command.split(' '));
			const { file } = await fetch('https://aws.random.cat/meow').then(response => response.json());
			console.log(file);
			message.reply(file);
		}
		else if (command.includes('ping')) {
			console.log(command.split(' '));
			message.reply('pong');
		}
	},
};

function randomIntFromInterval(min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min);
}