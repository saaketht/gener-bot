const fetch = require('node-fetch');

const foodCategories = ['biryani', 'burger', 'butter-chicken', 'dessert', 'dosa', 'idly', 'pasta', 'pizza', 'rice', 'samosa'];
module.exports = {
	name: 'food',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.split(' ').join('').toLowerCase();
		let foodType = '';
		foodCategories.forEach(i => {
			if (command.includes(i)) {
				foodType = i;
			}
			else if (command.includes('butterchicken')) {
				foodType = 'butter-chicken';
			}
		});
		if (foodType != '') {
			console.log(command.split(' '));
			const { image } = await fetch(`https://foodish-api.herokuapp.com/api/images/${foodType}`)
				.then(response => response.json());
			const link = image;
			await message.reply(link);
			console.log('message sent');
		}
	},
};
