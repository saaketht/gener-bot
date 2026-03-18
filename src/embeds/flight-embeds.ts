import { EmbedBuilder, User } from 'discord.js';
import { FlightData } from '../interfaces/FlightData';

// gray = scheduled/unknown, blue = in-flight, green = landed, red = cancelled/diverted
const STATUS_COLORS: Record<string, number> = {
	'Scheduled': 0x6B7280,
	'Boarding': 0xA855F7,
	'Departed': 0x3B82F6,
	'EnRoute': 0x3B82F6,
	'Approaching': 0x3B82F6,
	'Landing': 0x3B82F6,
	'Landed': 0x10B981,
	'Arrived': 0x10B981,
	'Cancelled': 0xEF4444,
	'Diverted': 0xEF4444,
	'Unknown': 0x6B7280,
};

const STATUS_EMOJI: Record<string, string> = {
	'Scheduled': '🕐',
	'Boarding': '🚶',
	'Departed': '🛫',
	'EnRoute': '✈️',
	'Approaching': '📡',
	'Landing': '🛬',
	'Landed': '🛬',
	'Arrived': '✅',
	'Cancelled': '❌',
	'Diverted': '⚠️',
	'Unknown': '❓',
};

function getColor(status: string, delayMinutes?: number): number {
	// amber for significant delays
	if (delayMinutes && delayMinutes > 15) return 0xF59E0B;
	return STATUS_COLORS[status] ?? 0x6B7280;
}

function getTzAbbr(timeZone?: string, refDate?: Date): string {
	if (!timeZone) return '';
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone,
			timeZoneName: 'short',
		}).formatToParts(refDate ?? new Date());
		const tz = parts.find(p => p.type === 'timeZoneName');
		return tz?.value ?? '';
	}
	catch {
		return '';
	}
}

function extractTimeStr(isoTime?: string, timeZone?: string): string {
	if (!isoTime) return '—';
	// handle "YYYY-MM-DD HH:mm" or "YYYY-MM-DDTHH:mm" formats
	const match = isoTime.match(/(\d{2}):(\d{2})/);
	if (!match) return isoTime;
	const h = parseInt(match[1]);
	const m = match[2];
	const ampm = h >= 12 ? 'PM' : 'AM';
	const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
	const tz = getTzAbbr(timeZone);
	return tz ? `${h12}:${m} ${ampm} ${tz}` : `${h12}:${m} ${ampm}`;
}

function parseUtcMs(utcTime?: string, localFallback?: string): number {
	// prefer UTC time for calculations
	if (utcTime) {
		// AeroDataBox UTC format: "2026-03-14 00:45Z" or "2026-03-14T00:45Z"
		const normalized = utcTime.replace(' ', 'T');
		const t = new Date(normalized.endsWith('Z') ? normalized : normalized + 'Z').getTime();
		if (!isNaN(t)) return t;
	}
	// fallback: try local time (unreliable for math but better than nothing)
	if (localFallback) {
		const normalized = localFallback.replace(' ', 'T');
		const t = new Date(normalized).getTime();
		if (!isNaN(t)) return t;
	}
	return NaN;
}

function buildProgressBar(data: FlightData): string {
	const barLen = 16;
	const depUtc = parseUtcMs(
		data.departure.actualTimeUtc ?? data.departure.scheduledTimeUtc,
		data.departure.actualTime ?? data.departure.scheduledTime,
	);
	const arrUtc = parseUtcMs(
		data.arrival.estimatedTimeUtc ?? data.arrival.scheduledTimeUtc,
		data.arrival.estimatedTime ?? data.arrival.scheduledTime,
	);
	const now = Date.now();

	if (isNaN(depUtc) || isNaN(arrUtc)) {
		return `\`${'─'.repeat(barLen)}\``;
	}

	const status = data.status;
	if (status === 'Landed' || status === 'Arrived') {
		return `\`${'━'.repeat(barLen)}\` ✅ **Arrived**`;
	}
	if (status === 'Cancelled') {
		return `\`${'─'.repeat(barLen)}\` ❌ **Cancelled**`;
	}

	if (now < depUtc) {
		const timeUntil = formatDuration(depUtc - now);
		const plane = '✈️';
		return `${plane}\`${'─'.repeat(barLen)}\`  Departs in **${timeUntil}**`;
	}

	// in flight
	const total = arrUtc - depUtc;
	const elapsed = now - depUtc;
	const progress = Math.min(Math.max(elapsed / total, 0), 1);
	const filledCount = Math.max(1, Math.round(progress * barLen));
	const emptyCount = barLen - filledCount;
	const remaining = arrUtc - now;

	const bar = '━'.repeat(filledCount) + '─'.repeat(emptyCount);
	const pct = Math.round(progress * 100);
	const eta = remaining > 0 ? `**~${formatDuration(remaining)}** left` : '**Arriving**';

	// insert plane emoji at the progress point
	const planePos = Math.min(filledCount, barLen - 1);
	const barChars = bar.split('');
	const before = barChars.slice(0, planePos).join('');
	const after = barChars.slice(planePos).join('');

	return `\`${before}\`✈️\`${after}\`  ${pct}% · ${eta}`;
}

function formatDuration(ms: number): string {
	const totalMin = Math.round(ms / 60000);
	if (totalMin < 1) return '<1m';
	if (totalMin < 60) return `${totalMin}m`;
	const hours = Math.floor(totalMin / 60);
	const mins = totalMin % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDelay(minutes?: number): string {
	if (!minutes || minutes <= 0) return '';
	if (minutes < 60) return `⚠️ **${minutes}m late**`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m > 0 ? `⚠️ **${h}h ${m}m late**` : `⚠️ **${h}h late**`;
}

const getFlightTrackingEmbed = (data: FlightData, _user?: User): EmbedBuilder => {
	const delay = data.departure.delay ?? data.arrival.delay;
	const emoji = STATUS_EMOJI[data.status] ?? '✈️';
	const delayStr = formatDelay(delay);

	const depTz = data.departure.airport.timeZone;
	const arrTz = data.arrival.airport.timeZone;
	const depTimeStr = extractTimeStr(data.departure.actualTime ?? data.departure.estimatedTime ?? data.departure.scheduledTime, depTz);
	const arrTimeStr = extractTimeStr(data.arrival.actualTime ?? data.arrival.estimatedTime ?? data.arrival.scheduledTime, arrTz);
	const schedDepStr = extractTimeStr(data.departure.scheduledTime, depTz);
	const schedArrStr = extractTimeStr(data.arrival.scheduledTime, arrTz);

	// header route display
	const depIata = data.departure.airport.iata;
	const arrIata = data.arrival.airport.iata;
	const routeLine = `**\`${depIata}\`** › › › ${emoji} › › › **\`${arrIata}\`**`;

	// status line
	const statusParts = [`${emoji} **${data.status}**`];
	if (delayStr) statusParts.push(delayStr);
	const statusLine = statusParts.join('  ·  ');

	// progress bar
	const progressBar = buildProgressBar(data);

	// departure info block
	const depParts = [`**${data.departure.airport.name}**`];
	if (data.departure.actualTime && data.departure.actualTime !== data.departure.scheduledTime) {
		depParts.push(`~~${schedDepStr}~~ → **${depTimeStr}**`);
	}
	else {
		depParts.push(`🕐 **${depTimeStr}**`);
	}
	const depDetails: string[] = [];
	if (data.departure.terminal) depDetails.push(`T${data.departure.terminal}`);
	if (data.departure.gate) depDetails.push(`Gate ${data.departure.gate}`);
	if (depDetails.length) depParts.push(depDetails.join(' · '));

	// arrival info block
	const arrParts = [`**${data.arrival.airport.name}**`];
	if (data.arrival.actualTime && data.arrival.actualTime !== data.arrival.scheduledTime) {
		arrParts.push(`~~${schedArrStr}~~ → **${arrTimeStr}**`);
	}
	else {
		arrParts.push(`🕐 **${arrTimeStr}**`);
	}
	const arrDetails: string[] = [];
	if (data.arrival.terminal) arrDetails.push(`T${data.arrival.terminal}`);
	if (data.arrival.gate) arrDetails.push(`Gate ${data.arrival.gate}`);
	if (data.arrival.baggage) arrDetails.push(`Belt ${data.arrival.baggage}`);
	if (arrDetails.length) arrParts.push(arrDetails.join(' · '));

	// aircraft + distance footer line
	const metaParts: string[] = [];
	if (data.aircraft) {
		metaParts.push(`🛩️ ${data.aircraft.model}${data.aircraft.registration ? ` · ${data.aircraft.registration}` : ''}`);
	}
	if (data.greatCircleDistance) {
		metaParts.push(`📏 ${Math.round(data.greatCircleDistance.km).toLocaleString()} km`);
	}

	const embed = new EmbedBuilder()
		.setColor(getColor(data.status, delay))
		.setTitle(`${data.airline.name} ${data.flightNumber}`)
		.setDescription(`${routeLine}\n${statusLine}\n\n${progressBar}`)
		.addFields(
			{ name: `🛫 Departure`, value: depParts.join('\n'), inline: true },
			{ name: `🛬 Arrival`, value: arrParts.join('\n'), inline: true },
		)
		.setFooter({ text: metaParts.length ? `${metaParts.join('  ·  ')}  ·  Last updated` : 'Last updated' })
		.setTimestamp();

	return embed;
};

const getFlightListEmbed = (flights: any[], user: User): EmbedBuilder => {
	const lines = flights.map((f: any) => {
		const emoji = STATUS_EMOJI[f.status] ?? '✈️';
		return `${emoji} **#${f.id}** · \`${f.flight_number}\` · ${f.flight_date} · *${f.status}*`;
	});

	return new EmbedBuilder()
		.setColor(0x8B5CF6)
		.setAuthor({
			name: user.username,
			iconURL: user.displayAvatarURL(),
		})
		.setTitle('✈️ Tracked Flights')
		.setDescription(lines.join('\n') || 'No flights tracked.')
		.setTimestamp();
};

const getFlightErrorEmbed = (message: string): EmbedBuilder => {
	return new EmbedBuilder()
		.setColor(0xEF4444)
		.setTitle('✈️ Flight Tracker')
		.setDescription(message)
		.setTimestamp();
};

export {
	getFlightTrackingEmbed,
	getFlightListEmbed,
	getFlightErrorEmbed,
};
