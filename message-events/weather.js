module.exports = {
	name: 'weather',
	execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('weather')) {
			console.log(command.split(' '));
			message.reply('pong');
		}
	},
};