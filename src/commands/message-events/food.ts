import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { searchImage } from '../../utils/imageSearch';

const foodCategories = ['biryani', 'burger', 'butter-chicken', 'dessert', 'dosa', 'idly', 'pasta', 'pizza', 'rice', 'samosa'];

const messageEvent: MessageEvent = {
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
				foodType = 'butter chicken';
			}
		});

		if (!foodType) return;

		try {
			if ('sendTyping' in message.channel) await message.channel.sendTyping();
			const url = await searchImage(foodType);
			if (!url) {
				await message.reply('No results found.');
				return;
			}
			await message.reply(url);
		}
		catch (error) {
			logger.error('food image search error:', error);
			await message.reply('Something went wrong with the image search.');
		}
	},
};

export default messageEvent;
export { foodCategories };
