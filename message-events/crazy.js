module.exports = {
	name: 'crazy',
	execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('crazy')) {
			console.log(command.split(' '));
			message.reply('fr');
		}
	},
};
