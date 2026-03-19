import { EmbedBuilder } from 'discord.js';
import { MessageEvent } from '../../types';
import logger from '../../utils/logger';

function tempToColor(feelsLikeF: number): number {
	if (feelsLikeF <= 32) return 0x4FC3F7;    // icy blue
	if (feelsLikeF <= 50) return 0x81D4FA;    // cool blue
	if (feelsLikeF <= 65) return 0xAED581;    // mild green
	if (feelsLikeF <= 80) return 0xFFD54F;    // warm yellow
	if (feelsLikeF <= 95) return 0xFF8A65;    // hot orange
	return 0xE53935;                           // scorching red
}

function tempToEmoji(feelsLikeF: number): string {
	if (feelsLikeF <= 32) return '🥶';
	if (feelsLikeF <= 50) return '❄️';
	if (feelsLikeF <= 65) return '🌤️';
	if (feelsLikeF <= 80) return '☀️';
	if (feelsLikeF <= 95) return '🔥';
	return '🌡️';
}

// Discord ANSI: 34=blue, 32=green, 33=yellow, 31=red, 1=bold, 0=reset
const ESC = '\u001b';
function tempToAnsi(feelsLikeF: number): string {
	if (feelsLikeF <= 32) return `${ESC}[1;34m`;   // bold blue
	if (feelsLikeF <= 50) return `${ESC}[34m`;      // blue
	if (feelsLikeF <= 65) return `${ESC}[32m`;      // green
	if (feelsLikeF <= 80) return `${ESC}[33m`;      // yellow
	if (feelsLikeF <= 95) return `${ESC}[1;31m`;    // bold red
	return `${ESC}[31m`;                             // red
}

function colorizeAscii(ascii: string, feelsLikeF: number): string {
	const color = tempToAnsi(feelsLikeF);
	return ascii.split('\n').map(line => `${color}${line}${ESC}[0m`).join('\n');
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
			const [raw, asciiText]: [any, string] = await Promise.all([
				fetch(`https://wttr.in/${encodedCity}?format=j1`, fetchOpts).then(r => r.json()),
				fetch(`https://wttr.in/${encodedCity}?0QTu`, fetchOpts).then(r => r.text()).catch(() => ''),
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
			const artBlock = ascii ? `\`\`\`ansi\n${colorizeAscii(ascii, feelsLike)}\n\`\`\`\n` : '';

			const coords = res.request?.[0]?.query ?? '';
			const locationLine = coords ? `📍 ${coords}` : '';

			const embed = new EmbedBuilder()
				.setColor(tempToColor(feelsLike))
				.setTitle(`${emoji}  ${displayCity}`)
				.setDescription(
					`${artBlock}**${tempF}°F** — feels like **${feelsLike}°F**\n${curr.weatherDesc?.[0]?.value ?? ''}`
					+ `\n💧 ${curr.humidity}%  humidity`
					+ (locationLine ? `\n${locationLine}` : ''),
				)
				.setFooter({ text: `Observed ${curr.localObsDateTime} • wttr.in` })
				.setTimestamp();

			await message.reply({ embeds: [embed] });
		} catch (error) {
			logger.error('weather error:', error);
			await message.reply('Something went wrong fetching the weather.');
		}
	},
};

export default messageEvent;
