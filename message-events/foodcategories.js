const foodCategories = ['burger', 'dessert', 'pasta', 'pizza'];
const indianFood = ['biryani', 'butter-chicken', 'dosa', 'idly', 'rice', 'samosa'];
module.exports = {
	name: 'foodcategories',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		if (command.includes('indianfood')) {
			console.log(command.split(' '));
			await message.reply(indianFood.join(', '));
		}
		else if (command.includes('foodcategories')) {
			console.log(command);
			await message.reply(foodCategories.join(', '));
		}
	},
};