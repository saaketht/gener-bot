import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command, DiscordClient } from '../../types';
import { TrackedFlights } from '../../models/dbObjects';
import { fetchFlightStatus } from '../../utils/flightApi';
import { getFlightTrackingEmbed, getFlightListEmbed, getFlightErrorEmbed } from '../../embeds/flight-embeds';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Op } from 'sequelize';

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
				.addIntegerOption(opt =>
					opt.setName('id')
						.setDescription('Tracking ID from /flight list')
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
			ephemeral: true,
		});
		return;
	}

	// default to today
	const date = dateInput ?? new Date().toISOString().split('T')[0];
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		await interaction.reply({
			embeds: [getFlightErrorEmbed('Invalid date format. Use `YYYY-MM-DD`.')],
			ephemeral: true,
		});
		return;
	}

	// check per-user limit
	const activeCount = await TrackedFlights.count({
		where: { user_id: interaction.user.id, active: true },
	});
	if (activeCount >= MAX_TRACKED_PER_USER) {
		await interaction.reply({
			embeds: [getFlightErrorEmbed(`You can track up to ${MAX_TRACKED_PER_USER} flights at a time. Remove one first with \`/flight remove\`.`)],
			ephemeral: true,
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
		},
	});
	if (existing) {
		await interaction.reply({
			embeds: [getFlightErrorEmbed(`You're already tracking ${flightNumber} on ${date}.`)],
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply();

	// fetch initial status to validate flight exists
	const data = await fetchFlightStatus(flightNumber, date);
	if (!data) {
		await interaction.editReply({
			embeds: [getFlightErrorEmbed(`Could not find flight **${flightNumber}** on ${date}. Check the flight number and date.`)],
		});
		return;
	}

	// create DB row
	const expiresAt = new Date(date);
	expiresAt.setDate(expiresAt.getDate() + 1);

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
			ephemeral: true,
		});
		return;
	}

	const embed = getFlightListEmbed(flights.map(f => (f as any).dataValues), interaction.user);
	await interaction.reply({ embeds: [embed] });
}

async function handleRemove(client: DiscordClient, interaction: ChatInputCommandInteraction) {
	const id = interaction.options.getInteger('id', true);

	const row = await TrackedFlights.findOne({
		where: { id, user_id: interaction.user.id, active: true },
	}) as any;

	if (!row) {
		await interaction.reply({
			content: 'Tracking ID not found. Use `/flight list` to see your flights.',
			ephemeral: true,
		});
		return;
	}

	await row.update({ active: false });
	if (client.flightTracker) {
		client.flightTracker.stopTracking(id);
	}

	await interaction.reply({
		content: `Stopped tracking **${row.flight_number}** on ${row.flight_date}.`,
		ephemeral: true,
	});
}

export default flightCommand;
