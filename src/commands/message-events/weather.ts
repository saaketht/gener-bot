import { MessageEvent } from '../../types';
import logger from '../../utils/logger';

const messageEvent: MessageEvent = {
	name: 'weather',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command[0] !== 'weather') return;

		const city = command[1] || 'west palm beach';
		logger.debug(`weather lookup: ${city}`);

		try {
			const res: any = await fetch(`https://wttr.in/${city}?format=j1`).then(response => response.json());
			const curr = res.current_condition[0];
			const near = res.nearest_area[0];
			await message.reply(`${near.areaName[0].value} feels like ${curr.FeelsLikeF}°F, and has ${curr.visibilityMiles} miles of visibility with ${curr.humidity}% humidity. Recorded at ${curr.localObsDateTime}`);
		} catch (error) {
			logger.error('weather error:', error);
			await message.reply('Something went wrong fetching the weather.');
		}
	},
};

export default messageEvent;
