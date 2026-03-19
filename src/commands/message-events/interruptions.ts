import { EmbedBuilder } from 'discord.js';
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
			try {
				const res: any = await fetch('https://api.unsplash.com/photos/random', {
					headers: { 'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
				}).then(r => r.json());

				if (!res.urls) {
					message.reply('No image found.');
					return;
				}

				const location = [res.location?.city, res.location?.country].filter(Boolean).join(', ');
				const camera = [res.exif?.make, res.exif?.model].filter(Boolean).join(' ');

				const embed = new EmbedBuilder()
					.setColor(parseInt((res.color ?? '#2C2F33').replace('#', ''), 16))
					.setImage(res.urls.regular)
					.setFooter({ text: [
						res.user?.name ? `📸 ${res.user.name}` : null,
						location ? `📍 ${location}` : null,
						camera || null,
						res.likes ? `❤️ ${res.likes}` : null,
					].filter(Boolean).join(' • ') || 'Unsplash' });

				if (res.description || res.alt_description) {
					embed.setTitle(res.description ?? res.alt_description);
				}

				message.reply({ embeds: [embed] });
			}
			catch (error) {
				logger.error('unsplash api error:', error);
			}
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
			}
			catch (error) {
				logger.error('dog api error:', error);
			}
		}
		else if (noSpaces.includes('cat')) {
			try {
				const res: any = await fetch('https://cataas.com/cat?json=true').then(response => response.json());
				message.reply(res.url);
			}
			catch (error) {
				logger.error('cat api error:', error);
			}
		}
		else if (noSpaces.includes('rolldice')) {
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
