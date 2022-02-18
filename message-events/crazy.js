module.exports = {
	name: 'crazy',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('crazy')) {
			console.log(command.split(' '));
			await message.reply('fr');
		}
	},
};
