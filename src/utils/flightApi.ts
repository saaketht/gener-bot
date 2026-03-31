import { FlightData } from '../interfaces/FlightData';
import logger from './logger';

export async function fetchFlightStatus(flightNumber: string, date: string): Promise<FlightData | null> {
	try {
		// FlightAware AeroAPI v4: GET /flights/{ident}?start=...&end=...
		const start = `${date}T00:00:00Z`;
		const end = `${date}T23:59:59Z`;
		const url = new URL(`https://aeroapi.flightaware.com/aeroapi/flights/${flightNumber}`);
		url.searchParams.set('start', start);
		url.searchParams.set('end', end);

		const response = await fetch(url.toString(), {
			headers: {
				'x-apikey': process.env.FLIGHTAWARE_API_KEY!,
			},
		});

		if (!response.ok) throw new Error(`FlightAware returned ${response.status}`);
		const body = await response.json();
		const flights = body.flights;
		if (!Array.isArray(flights) || flights.length === 0) {
			return null;
		}

		return normalize(flights[0]);
	}
	catch (error) {
		logger.error('Failed to fetch flight status', { flightNumber, date, error });
		return null;
	}
}

function toLocalTime(utcIso: string | null | undefined, timeZone: string | null | undefined): string | undefined {
	if (!utcIso) return undefined;
	if (!timeZone) return utcIso;
	try {
		const d = new Date(utcIso);
		if (isNaN(d.getTime())) return undefined;
		// format as "YYYY-MM-DD HH:mm" in the airport's local timezone
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		}).formatToParts(d);
		const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
		return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
	}
	catch {
		return utcIso;
	}
}

function normalizeStatus(raw: any): string {
	// FlightAware status is a sentence like "En Route / On Time", "Landed / Delayed", etc.
	const status: string = raw.status ?? '';
	const s = status.toLowerCase();

	if (raw.cancelled) return 'Cancelled';
	if (raw.diverted) return 'Diverted';
	if (s.includes('landed') || s.includes('arrived')) return 'Landed';
	if (s.includes('en route') || s.includes('enroute')) return 'EnRoute';
	if (s.includes('taxiing')) return 'Landed';
	if (s.includes('scheduled') || s === '') return 'Scheduled';

	// fallback: check actual times
	if (raw.actual_on || raw.actual_in) return 'Landed';
	if (raw.actual_off || raw.actual_out) return 'Departed';
	return 'Scheduled';
}

function normalize(raw: any): FlightData {
	const depTz = raw.origin?.timezone;
	const arrTz = raw.destination?.timezone;

	// FlightAware uses out/in (gate) and off/on (runway)
	// Use gate times (out/in) for display, runway times (off/on) as fallback
	const schedDepUtc = raw.scheduled_out ?? raw.scheduled_off;
	const actualDepUtc = raw.actual_out ?? raw.actual_off;
	const estDepUtc = raw.estimated_out ?? raw.estimated_off;
	const schedArrUtc = raw.scheduled_in ?? raw.scheduled_on;
	const actualArrUtc = raw.actual_in ?? raw.actual_on;
	const estArrUtc = raw.estimated_in ?? raw.estimated_on;

	return {
		airline: {
			name: raw.operator_iata ?? raw.operator_icao ?? raw.operator ?? 'Unknown',
			iata: raw.operator_iata ?? raw.operator_icao ?? '',
		},
		flightNumber: raw.ident_iata ?? raw.ident ?? '',
		status: normalizeStatus(raw),
		departure: {
			airport: {
				name: raw.origin?.name ?? 'Unknown',
				iata: raw.origin?.code_iata ?? raw.origin?.code ?? '',
				timeZone: depTz,
			},
			scheduledTime: toLocalTime(schedDepUtc, depTz),
			actualTime: toLocalTime(actualDepUtc, depTz),
			estimatedTime: toLocalTime(estDepUtc, depTz),
			scheduledTimeUtc: schedDepUtc,
			actualTimeUtc: actualDepUtc,
			estimatedTimeUtc: estDepUtc,
			delay: raw.departure_delay != null ? Math.round(raw.departure_delay / 60) : undefined,
		},
		arrival: {
			airport: {
				name: raw.destination?.name ?? 'Unknown',
				iata: raw.destination?.code_iata ?? raw.destination?.code ?? '',
				timeZone: arrTz,
			},
			scheduledTime: toLocalTime(schedArrUtc, arrTz),
			actualTime: toLocalTime(actualArrUtc, arrTz),
			estimatedTime: toLocalTime(estArrUtc, arrTz),
			scheduledTimeUtc: schedArrUtc,
			actualTimeUtc: actualArrUtc,
			estimatedTimeUtc: estArrUtc,
			delay: raw.arrival_delay != null ? Math.round(raw.arrival_delay / 60) : undefined,
		},
		aircraft: raw.aircraft_type ? {
			model: raw.aircraft_type,
			registration: raw.registration ?? '',
		} : undefined,
	};
}
