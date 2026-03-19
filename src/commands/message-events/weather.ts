import { EmbedBuilder } from 'discord.js';
import { MessageEvent } from '../../types';
import logger from '../../utils/logger';

// icy blue → cool blue → mild green → warm yellow → hot orange → scorching red
function tempToColor(feelsLikeF: number): number {
	if (feelsLikeF <= 32) return 0x4FC3F7;
	if (feelsLikeF <= 50) return 0x81D4FA;
	if (feelsLikeF <= 65) return 0xAED581;
	if (feelsLikeF <= 80) return 0xFFD54F;
	if (feelsLikeF <= 95) return 0xFF8A65;
	return 0xE53935;
}

function tempToEmoji(feelsLikeF: number): string {
	if (feelsLikeF <= 32) return '🥶';
	if (feelsLikeF <= 50) return '❄️';
	if (feelsLikeF <= 65) return '🌤️';
	if (feelsLikeF <= 80) return '☀️';
	if (feelsLikeF <= 95) return '🔥';
	return '🌡️';
}

// Discord supports basic ANSI (30-37) + bold (1) in ```ansi blocks.
// wttr.in uses 256-color (38;5;N). Map 256→nearest basic code via RGB distance.
// [ansi code, R, G, B] — Discord's rendered colors in dark theme
const BASIC_ANSI: [number, number, number, number][] = [
	[30, 0x4f, 0x54, 0x5c],
	[31, 0xdc, 0x32, 0x2f],
	[32, 0x85, 0x99, 0x00],
	[33, 0xb5, 0x89, 0x00],
	[34, 0x26, 0x8b, 0xd2],
	[35, 0xd3, 0x36, 0x82],
	[36, 0x2a, 0xa1, 0x98],
	[37, 0xee, 0xe8, 0xd5],
];

function xterm256ToRgb(n: number): [number, number, number] {
	if (n < 16) {
		// Standard 16 colors — approximate
		const base: [number, number, number][] = [
			[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
			[0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
			[128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
			[0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
		];
		return base[n];
	}
	if (n < 232) {
		const idx = n - 16;
		const r = Math.floor(idx / 36);
		const g = Math.floor((idx % 36) / 6);
		const b = idx % 6;
		const val = (v: number) => v === 0 ? 0 : 55 + v * 40;
		return [val(r), val(g), val(b)];
	}
	// Greyscale 232-255
	const v = 8 + (n - 232) * 10;
	return [v, v, v];
}

function nearestBasicAnsi(xtermCode: number): number {
	const [r, g, b] = xterm256ToRgb(xtermCode);
	let best = 37;
	let bestDist = Infinity;
	for (const [code, br, bg, bb] of BASIC_ANSI) {
		const dist = (r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2;
		if (dist < bestDist) {
			bestDist = dist;
			best = code;
		}
	}
	return best;
}

/** Replace wttr.in 256-color escapes with Discord-compatible basic ANSI */
function convertAnsi(text: string): string {
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1b\[([0-9;]+)m/g, (_match, codes: string) => {
		const parts = codes.split(';').map(Number);
		const out: number[] = [];
		for (let i = 0; i < parts.length; i++) {
			if (parts[i] === 38 && parts[i + 1] === 5 && parts[i + 2] !== undefined) {
				out.push(nearestBasicAnsi(parts[i + 2]));
				i += 2;
			}
			else if (parts[i] === 0 || parts[i] === 1) {
				out.push(parts[i]);
			}
		}
		return out.length ? `\x1b[${out.join(';')}m` : '\x1b[0m';
	});
}

const messageEvent: MessageEvent = {
	name: 'weather',
	async execute(message) {
		if (message.author.bot) return;
		const command = message.content.toLowerCase().split(' ');
		if (command[0] !== 'weather') return;

		const city = command.slice(1).join(' ') || 'west palm beach';
		logger.debug(`weather lookup: ${city}`);

		try {
			if ('sendTyping' in message.channel) await message.channel.sendTyping();
			const encodedCity = city.replace(/ /g, '+');
			const fetchOpts = { headers: { 'User-Agent': 'curl/8.0' } };
			const [raw, asciiText, geoData]: [any, string, any[]] = await Promise.all([
				fetch(`https://wttr.in/${encodedCity}?format=j1`, fetchOpts).then(r => r.json()),
				fetch(`https://wttr.in/${encodedCity}?0Qu`, fetchOpts).then(r => r.text()).catch(() => ''),
				fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: city, format: 'json', limit: '1' })}`, {
					headers: { 'User-Agent': 'gener-bot/1.0' },
				}).then(r => r.ok ? r.json() : []).catch(() => []),
			]);
			const res = raw.data ?? raw;
			const curr = res.current_condition?.[0];

			if (!curr) {
				await message.reply(`Couldn't find weather data for "${city}".`);
				return;
			}

			const feelsLike = parseFloat(curr.FeelsLikeF);
			const tempF = parseFloat(curr.temp_F);
			const emoji = tempToEmoji(feelsLike);
			const displayCity = city.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
			const ascii = asciiText.trimEnd();
			const artBlock = ascii ? `\`\`\`ansi\n${convertAnsi(ascii)}\n\`\`\`` : '';

			const geo = geoData[0];
			const lines = [artBlock];
			// lines.push(`🌀	${curr.weatherDesc?.[0]?.value ?? 'Unknown'}`);
			// lines.push(`💧	${curr.humidity}% humidity`);
			if (geo?.lat && geo?.lon) lines.push(`🗺️	${geo.lat}, ${geo.lon}`);
			if (geo?.display_name) lines.push(`📍	${geo.display_name}`);

			const embed = new EmbedBuilder()
				.setColor(tempToColor(feelsLike))
				.setTitle(`${emoji}  ${displayCity} — ${tempF}°F (feels ${feelsLike}°F)`)
				.setDescription(lines.join('\n'))
				.setFooter({ text: `Observed ${curr.localObsDateTime} • wttr.in` })
				.setTimestamp();

			await message.reply({ embeds: [embed] });
		}
		catch (error) {
			logger.error('weather error:', error);
			await message.reply('Something went wrong fetching the weather.');
		}
	},
};

export default messageEvent;
export { tempToColor, tempToEmoji, xterm256ToRgb, nearestBasicAnsi, convertAnsi };
