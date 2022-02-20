const fetch = require('node-fetch');

module.exports = {
	name: 'weather',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('weather')) {
			console.log(command.split(' '));
			const { file } = await fetch('https://wttr.in/').then(response => response.json());
			console.log(file);
			message.reply(file);
		}
	},
};