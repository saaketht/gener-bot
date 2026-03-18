import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, TextChannel } from 'discord.js';
import { MessageEvent } from '../../types';
import { TrackedFlights } from '../../models/dbObjects';
import { fetchFlightStatus } from '../../utils/flightApi';
import { getFlightTrackingEmbed, getFlightErrorEmbed } from '../../embeds/flight-embeds';
import { rateLimiter } from '../../utils/rateLimiter';
import { Op } from 'sequelize';
import logger from '../../utils/logger';

const messageEvent: MessageEvent = {
	name: 'flight',
	async execute(message: Message) {
		if (message.author.bot) return;
		if (!message.content.toLowerCase().startsWith('flight')) return;
		if (!message.guild) return;

		if (!rateLimiter(message.author.id, 'flight_msg', 2, 30000)) {
			await message.reply('Slow down — try again in a few seconds.');
			return;
		}

		try {
			const channel = message.channel as TextChannel;
			const flights = await TrackedFlights.findAll({
				where: {
					guild_id: message.guild.id,
					active: true,
					expires_at: { [Op.gt]: new Date() },
				},
			});

			if (flights.length === 0) {
				await message.reply('No flights being tracked in this server. Use `/flight track` to add one.');
				return;
			}

			for (const flight of flights) {
				const f = flight as any;
				const data = await fetchFlightStatus(f.flight_number, f.flight_date);

				if (data) {
					const embed = getFlightTrackingEmbed(data, message.author);
					const refreshButton = new ButtonBuilder()
						.setCustomId(`flight_refresh_${f.id}`)
						.setLabel('Refresh')
						.setStyle(ButtonStyle.Secondary)
						.setEmoji('🔄');
					const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);
					await channel.send({ embeds: [embed], components: [actionRow] });

					await f.update({ last_api_data: JSON.stringify(data), status: data.status.toLowerCase() });
				}
				else if (f.last_api_data) {
					const cached = JSON.parse(f.last_api_data);
					const embed = getFlightTrackingEmbed(cached, message.author);
					const refreshButton = new ButtonBuilder()
						.setCustomId(`flight_refresh_${f.id}`)
						.setLabel('Refresh')
						.setStyle(ButtonStyle.Secondary)
						.setEmoji('🔄');
					const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);
					await channel.send({ embeds: [embed], components: [actionRow] });
				}
				else {
					await channel.send({ embeds: [getFlightErrorEmbed(`Could not fetch data for ${f.flight_number}.`)] });
				}
			}
		}
		catch (error) {
			logger.error('Error in flight message event', { error });
			await message.reply('Something went wrong fetching flight data.');
		}
	},
};

export default messageEvent;
