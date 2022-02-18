module.exports = {
	name: 'bing',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('bing')) {
			console.log(command.split(' '));
			await message.reply('bong');
		}
	},
};
