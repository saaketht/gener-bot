module.exports = {
	name: 'bruh',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('bruh')) {
			console.log(command.split(' '));
			await message.reply('bruh');
		}
	},
};
