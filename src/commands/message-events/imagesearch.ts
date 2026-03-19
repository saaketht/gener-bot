import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { searchImage } from '../../utils/imageSearch';

const messageEvent: MessageEvent = {
	name: 'imagesearch',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');

		if (command[0] !== 'imagesearch') return;

		let sliceFrom = 1;
		let imgIndex: number | undefined;
		if (!isNaN(Number(command[1])) && Number(command[1]) < 200) {
			imgIndex = Number(command[1]);
			sliceFrom = 2;
		}

		const searchQuery = command.slice(sliceFrom).join(' ');
		if (!searchQuery) return;

		logger.debug(`imagesearch query: "${searchQuery}", index: ${imgIndex ?? 'random'}`);

		try {
			if ('sendTyping' in message.channel) await message.channel.sendTyping();
			const url = await searchImage(searchQuery, imgIndex);
			if (!url) {
				await message.reply('No results found.');
				return;
			}
			await message.reply(url);
		}
		catch (error) {
			logger.error('imagesearch error:', error);
			await message.reply('Something went wrong with the image search.');
		}
	},
};

export default messageEvent;
