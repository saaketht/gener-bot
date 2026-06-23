import { EmbedBuilder } from 'discord.js';
import { MessageEvent } from '../../types';
import logger from '../../utils/logger';

const foodCategories = ['burger', 'dessert', 'pasta', 'pizza'];
const indianFood = ['biryani', 'butter-chicken', 'dosa', 'idly', 'rice', 'samosa'];
const rolls = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
const caps = ['🧢', '🎓', '🎩', '👒', '🪖', '⛑️'];

interface UnsplashPhoto {
	urls?: { regular: string };
	color?: string;
	description?: string | null;
	alt_description?: string | null;
	likes?: number;
	user?: { name?: string };
	location?: { city?: string; country?: string };
	exif?: { make?: string; model?: string };
}

interface DogResponse {
	status: string;
	message: string;
}

interface CataasResponse {
	url: string;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const parseHexColor = (hex?: string): number => {
	const cleaned = (hex ?? '').replace('#', '');
	const parsed = parseInt(cleaned, 16);
	return cleaned.length === 6 && Number.isFinite(parsed) ? parsed : 0x2C2F33;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) {
		throw new Error(`${url} → ${response.status} ${response.statusText}`);
	}
	return response.json() as Promise<T>;
}

const messageEvent: MessageEvent = {
	name: 'interruptions',
	async execute(message) {
		if (message.author.bot) return;
		const lower = message.content.toLowerCase();
		const spaces = lower.split(' ');
		const noSpaces = spaces.join('');
		const trimmed = lower.trim();

		if (noSpaces.includes('ping')) {
			message.react('🏓');
		}
		else if (spaces.includes('cap')) {
			message.react(pick(caps));
		}
		else if (spaces.includes('daily')) {
			message.reply('https://xkcd.com/');
		}
		else if (trimmed === 'random') {
			try {
				const res = await fetchJson<UnsplashPhoto>('https://api.unsplash.com/photos/random', {
					headers: { 'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
				});

				if (!res.urls) {
					message.reply('No image found.');
					return;
				}

				const location = [res.location?.city, res.location?.country].filter(Boolean).join(', ');
				const camera = [res.exif?.make, res.exif?.model].filter(Boolean).join(' ');

				const embed = new EmbedBuilder()
					.setColor(parseHexColor(res.color))
					.setImage(res.urls.regular)
					.setFooter({ text: [
						res.user?.name ? `📸 ${res.user.name}` : null,
						location ? `📍 ${location}` : null,
						camera || null,
						res.likes ? `❤️ ${res.likes}` : null,
					].filter(Boolean).join(' • ') || 'Unsplash' });

				const title = res.description ?? res.alt_description;
				if (title) {
					embed.setTitle(title);
				}

				message.reply({ embeds: [embed] });
			}
			catch (error) {
				logger.error('unsplash api error:', error);
			}
		}
		else if (lower.includes('indian food')) {
			message.reply(indianFood.join(', '));
		}
		else if (lower.includes('food categories')) {
			message.reply(foodCategories.join(', '));
		}
		else if (trimmed === 'dog') {
			try {
				const res = await fetchJson<DogResponse>('https://dog.ceo/api/breeds/image/random');
				logger.debug(`dog api status: ${res.status}`);
				message.reply(res.message);
			}
			catch (error) {
				logger.error('dog api error:', error);
			}
		}
		else if (trimmed === 'cat') {
			try {
				const res = await fetchJson<CataasResponse>('https://cataas.com/cat?json=true');
				const url = res.url.startsWith('http') ? res.url : `https://cataas.com${res.url}`;
				message.reply(url);
			}
			catch (error) {
				logger.error('cat api error:', error);
			}
		}
		else if (noSpaces.includes('roll')) {
			try {
				await message.react(pick(rolls));
				await message.react(pick(rolls));
			}
			catch (error) {
				logger.error('Failed to add dice reactions:', error);
			}
		}
	},
};

export default messageEvent;
