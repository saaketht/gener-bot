const fetch = require('node-fetch');

module.exports = {
	name: 'cat',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('cat')) {
			console.log(command.split(' '));
			const { file } = await fetch('https://aws.random.cat/meow').then(response => response.json());
			console.log(file);
			message.reply(file);
		}
	},
};