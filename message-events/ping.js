module.exports = {
	name: 'ping',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('ping')) {
			console.log(command.split(' '));
			await message.reply('pong');
		}
	},
};