import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { Command, DiscordClient } from '../../types';
import { TrackedFlights } from '../../models/dbObjects';
import { fetchFlightStatus } from '../../utils/flightApi';
import { getFlightTrackingEmbed, getFlightListEmbed, getFlightErrorEmbed } from '../../embeds/flight-embeds';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Op } from 'sequelize';
import logger from '../../utils/logger';

const MAX_TRACKED_PER_USER = 5;

const flightCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('flight')
		.setDescription('Track flights in real-time')
		.addSubcommand(sub =>
			sub.setName('track')
				.setDescription('Start tracking a flight')
				.addStringOption(opt =>
					opt.setName('flight_number')
						.setDescription('Flight number (e.g. NK220, AA100)')
						.setRequired(true))
				.addStringOption(opt =>
					opt.setName('date')
						.setDescription('Flight date (YYYY-MM-DD, defaults to today)')
						.setRequired(false)),
		)
		.addSubcommand(sub =>
			sub.setName('list')
				.setDescription('View your tracked flights'),
		)
		.addSubcommand(sub =>
			sub.setName('remove')
				.setDescription('Stop tracking a flight')
				.addStringOption(opt =>
					opt.setName('flight')
						.setDescription('Flight number (e.g. AA2633) or tracking ID (e.g. #3)')
						.setRequired(true)),
		) as SlashCommandBuilder,

	async execute(client: DiscordClient, interaction: ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand();

		if (sub === 'track') await handleTrack(client, interaction);
		else if (sub === 'list') await handleList(interaction);
		else if (sub === 'remove') await handleRemove(client, interaction);
	},
};

async function handleTrack(client: DiscordClient, interaction: ChatInputCommandInteraction) {
	const flightNumber = interaction.options.getString('flight_number', true).toUpperCase().replace(/\s+/g, '');
	const dateInput = interaction.options.getString('date');

	// validate flight number format (2 letter airline + 1-4 digit number)
	if (!/^[A-Z0-9]{2}\d{1,4}$/.test(flightNumber)) {
		await interaction.reply({
			embeds: [getFlightErrorEmbed('Invalid flight number format. Use airline code + number, e.g. `NK220`, `AA100`.')],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// default to today (UTC), but also try yesterday if no explicit date
	// since the server may be in UTC while the user is in an earlier timezone
	let date: string;
	let autoDate = false;
	if (dateInput) {
		date = dateInput;
	}
	else {
		date = new Date().toISOString().split('T')[0];
		autoDate = true;
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		await interaction.reply({
			embeds: [getFlightErrorEmbed('Invalid date format. Use `YYYY-MM-DD`.')],
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// defer early — DB queries + API calls can exceed Discord's 3s window
	await interaction.deferReply();

	// check per-user limit
	const activeCount = await TrackedFlights.count({
		where: { user_id: interaction.user.id, active: true },
	});
	if (activeCount >= MAX_TRACKED_PER_USER) {
		await interaction.editReply({
			embeds: [getFlightErrorEmbed(`You can track up to ${MAX_TRACKED_PER_USER} flights at a time. Remove one first with \`/flight remove\`.`)],
		});
		return;
	}

	// check for duplicate
	const existing = await TrackedFlights.findOne({
		where: {
			user_id: interaction.user.id,
			flight_number: flightNumber,
			flight_date: date,
			active: true,
			expires_at: { [Op.gt]: new Date() },
		},
	});
	if (existing) {
		await interaction.editReply({
			embeds: [getFlightErrorEmbed(`You're already tracking ${flightNumber} on ${date}.`)],
		});
		return;
	}

	// fetch initial status to validate flight exists
	let data = await fetchFlightStatus(flightNumber, date);

	// if no date was provided and UTC "today" failed, try yesterday
	// handles timezone mismatch (server in UTC, user in e.g. EST)
	if (!data && autoDate) {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		const yesterdayStr = yesterday.toISOString().split('T')[0];
		logger.info(`Flight track: ${flightNumber} not found on ${date}, trying yesterday (${yesterdayStr})`);
		data = await fetchFlightStatus(flightNumber, yesterdayStr);
		if (data) {
			date = yesterdayStr;
		}
	}

	if (!data) {
		logger.info(`Flight track: ${flightNumber} not found on any date, user=${interaction.user.id}`);
		await interaction.editReply({
			embeds: [getFlightErrorEmbed(`Could not find flight **${flightNumber}** on ${date}. Check the flight number and date.`)],
		});
		return;
	}

	// create DB row
	// 48h buffer so flights crossing midnight/timezones don't expire prematurely
	const expiresAt = new Date(date);
	expiresAt.setDate(expiresAt.getDate() + 2);

	const embed = getFlightTrackingEmbed(data, interaction.user);
	const refreshButton = new ButtonBuilder()
		.setCustomId('flight_refresh_placeholder')
		.setLabel('Refresh')
		.setStyle(ButtonStyle.Secondary)
		.setEmoji('🔄');
	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);

	const reply = await interaction.editReply({ embeds: [embed], components: [actionRow] });

	const row = await TrackedFlights.create({
		user_id: interaction.user.id,
		guild_id: interaction.guildId,
		channel_id: interaction.channelId,
		message_id: reply.id,
		flight_number: flightNumber,
		flight_date: date,
		status: data.status.toLowerCase(),
		last_api_data: JSON.stringify(data),
		expires_at: expiresAt,
	}) as any;

	logger.info(`Flight tracked: ${flightNumber} on ${date}, status=${data.status}, row=${row.id}, user=${interaction.user.id}, guild=${interaction.guildId}`);

	// update the button with the actual DB row ID
	const realButton = new ButtonBuilder()
		.setCustomId(`flight_refresh_${row.id}`)
		.setLabel('Refresh')
		.setStyle(ButtonStyle.Secondary)
		.setEmoji('🔄');
	const realRow = new ActionRowBuilder<ButtonBuilder>().addComponents(realButton);
	await interaction.editReply({ components: [realRow] });

	// start polling
	if (client.flightTracker) {
		// don't do initial poll since we just fetched — set interval directly
		const tracker = client.flightTracker;
		const timer = setInterval(() => tracker?.pollAndUpdate(row.id), 5 * 60_000);
		(client.flightTracker as any).intervals.set(row.id, timer);
	}
}

async function handleList(interaction: ChatInputCommandInteraction) {
	const flights = await TrackedFlights.findAll({
		where: {
			user_id: interaction.user.id,
			active: true,
			expires_at: { [Op.gt]: new Date() },
		},
	});

	if (flights.length === 0) {
		await interaction.reply({
			content: 'You\'re not tracking any flights. Use `/flight track` to start.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const embed = getFlightListEmbed(flights.map(f => (f as any).dataValues), interaction.user);
	await interaction.reply({ embeds: [embed] });
}

async function handleRemove(client: DiscordClient, interaction: ChatInputCommandInteraction) {
	const input = interaction.options.getString('flight', true).trim();

	// check if input is a tracking ID (e.g. "#3" or "3")
	const idMatch = input.match(/^#?(\d+)$/);
	let row: any;

	if (idMatch) {
		const id = parseInt(idMatch[1]);
		row = await TrackedFlights.findOne({
			where: { id, user_id: interaction.user.id, active: true },
		});
	}
	else {
		const flightNumber = input.toUpperCase().replace(/\s+/g, '');
		row = await TrackedFlights.findOne({
			where: { flight_number: flightNumber, user_id: interaction.user.id, active: true },
		});
	}

	if (!row) {
		await interaction.reply({
			content: `No active tracking found for **${input}**. Use \`/flight list\` to see your flights.`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await row.update({ active: false });
	if (client.flightTracker) {
		client.flightTracker.stopTracking(row.id);
	}

	logger.info(`Flight removed: ${row.flight_number} on ${row.flight_date}, row=${row.id}, user=${interaction.user.id}`);
	await interaction.reply({
		content: `Stopped tracking **${row.flight_number}** on ${row.flight_date}.`,
		flags: MessageFlags.Ephemeral,
	});
}

export default flightCommand;
