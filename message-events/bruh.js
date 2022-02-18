module.exports = {
	name: 'bruh',
	execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('bruh')) {
			console.log(command.split(' '));
			message.reply('bruh');
		}
	},
};
