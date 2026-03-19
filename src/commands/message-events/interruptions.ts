import { MessageEvent } from '../../types';
import logger from '../../utils/logger';
import { randomIntFromInterval } from '../../utils/helpers';

const foodCategories = ['burger', 'dessert', 'pasta', 'pizza'];
const indianFood = ['biryani', 'butter-chicken', 'dosa', 'idly', 'rice', 'samosa'];
const rolls = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
const caps = ['🧢', '🎓', '🎩', '👒', '🪖', '⛑️'];

const messageEvent: MessageEvent = {
	name: 'interruptions',
	async execute(message) {
		if (message.author.bot) return;
		const spaces = message.content.toLowerCase().split(' ');
		const noSpaces = spaces.join('');

		if (noSpaces.includes('ping')) {
			message.react('🏓');
		}
		else if (noSpaces.includes('daily')) {
			message.reply('https://xkcd.com/');
		}
		else if (noSpaces.includes('random')) {
			const res = 'https://source.unsplash.com/random/300x200?sig=' + Math.random();
			message.reply(res);
		}
		else if (spaces.includes('indian food')) {
			message.reply(indianFood.join(', '));
		}
		else if (spaces.includes('food categories')) {
			message.reply(foodCategories.join(', '));
		}
		else if (spaces.includes('dog')) {
			try {
				const res: any = await fetch('https://dog.ceo/api/breeds/image/random').then(response => response.json());
				logger.debug(`dog api status: ${res.status}`);
				message.reply(res.message);
			} catch (error) {
				logger.error('dog api error:', error);
			}
		}
		else if (noSpaces.includes('cat')) {
			try {
				const res: any = await fetch('https://aws.random.cat/meow').then(response => response.json());
				message.reply(res.file);
			} catch (error) {
				logger.error('cat api error:', error);
			}
		}
		else if (noSpaces.includes('diceroll')) {
			const res = randomIntFromInterval(1, rolls.length);
			message.react(rolls[res - 1]);
		}
		else if (spaces.includes('cap')) {
			const res = randomIntFromInterval(1, caps.length);
			message.react(caps[res - 1]);
		}
	},
};

export default messageEvent;
