import { FlightData } from '../interfaces/FlightData';
import logger from './logger';

export async function fetchFlightStatus(flightNumber: string, date: string): Promise<FlightData | null> {
	// try FlightAware first (more reliable, but limited to ±2 days)
	const fa = await fetchFlightAware(flightNumber, date);
	if (fa) return fa;

	// fallback to AeroDataBox for schedule data further out
	return fetchAeroDataBox(flightNumber, date);
}

async function fetchFlightAware(flightNumber: string, date: string): Promise<FlightData | null> {
	const t0 = Date.now();
	try {
		const start = `${date}T00:00:00Z`;
		const end = `${date}T23:59:59Z`;
		const url = new URL(`https://aeroapi.flightaware.com/aeroapi/flights/${flightNumber}`);
		url.searchParams.set('start', start);
		url.searchParams.set('end', end);

		const response = await fetch(url.toString(), {
			headers: {
				'x-apikey': process.env.FLIGHTAWARE_API_KEY!,
			},
			signal: AbortSignal.timeout(10_000),
		});

		if (!response.ok) throw new Error(`FlightAware returned ${response.status}`);
		const body = await response.json();
		const flights = body.flights;
		if (!Array.isArray(flights) || flights.length === 0) {
			logger.info(`FlightAware: no results for ${flightNumber} on ${date} (${Date.now() - t0}ms)`);
			return null;
		}

		logger.info(`FlightAware: found ${flightNumber} on ${date}, status=${flights[0].status ?? 'unknown'} (${Date.now() - t0}ms)`);
		return normalizeFlightAware(flights[0]);
	}
	catch (error) {
		logger.error(`FlightAware: failed for ${flightNumber} on ${date} (${Date.now() - t0}ms)`, { error });
		return null;
	}
}

async function fetchAeroDataBox(flightNumber: string, date: string): Promise<FlightData | null> {
	const t0 = Date.now();
	try {
		const url = new URL(`https://aerodatabox.p.rapidapi.com/flights/number/${flightNumber}/${date}`);
		url.searchParams.set('withAircraftImage', 'false');
		url.searchParams.set('withLocation', 'false');

		const response = await fetch(url.toString(), {
			headers: {
				'x-rapidapi-key': process.env.rapidApiKey!,
				'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
			},
			signal: AbortSignal.timeout(10_000),
		});

		if (!response.ok) throw new Error(`AeroDataBox returned ${response.status}`);
		const flights = await response.json();
		if (!Array.isArray(flights) || flights.length === 0) {
			logger.info(`AeroDataBox: no results for ${flightNumber} on ${date} (${Date.now() - t0}ms)`);
			return null;
		}

		logger.info(`AeroDataBox: found ${flightNumber} on ${date}, status=${flights[0].status ?? 'unknown'} (${Date.now() - t0}ms)`);
		return normalizeAeroDataBox(flights[0]);
	}
	catch (error) {
		logger.error(`AeroDataBox: failed for ${flightNumber} on ${date} (${Date.now() - t0}ms)`, { error });
		return null;
	}
}

// --- FlightAware normalization ---

function toLocalTime(utcIso: string | null | undefined, timeZone: string | null | undefined): string | undefined {
	if (!utcIso) return undefined;
	if (!timeZone) return utcIso;
	try {
		const d = new Date(utcIso);
		if (isNaN(d.getTime())) return undefined;
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

function normalizeFlightAwareStatus(raw: any): string {
	const status: string = raw.status ?? '';
	const s = status.toLowerCase();

	if (raw.cancelled) return 'Cancelled';
	if (raw.diverted) return 'Diverted';
	if (s.includes('landed') || s.includes('arrived')) return 'Landed';
	if (s.includes('en route') || s.includes('enroute')) return 'EnRoute';
	if (s.includes('taxiing')) return 'Landed';
	if (s.includes('scheduled') || s === '') return 'Scheduled';

	if (raw.actual_on || raw.actual_in) return 'Landed';
	if (raw.actual_off || raw.actual_out) return 'Departed';
	return 'Scheduled';
}

function normalizeFlightAware(raw: any): FlightData {
	const depTz = raw.origin?.timezone;
	const arrTz = raw.destination?.timezone;

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
		status: normalizeFlightAwareStatus(raw),
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

// --- AeroDataBox normalization ---

function parseAdbTime(obj: any, fallbackLocal?: string): { local?: string; utc?: string } {
	if (!obj && !fallbackLocal) return {};
	if (typeof obj === 'string') return { local: obj };
	return {
		local: obj?.local ?? fallbackLocal,
		utc: obj?.utc,
	};
}

function normalizeAeroDataBox(raw: any): FlightData {
	const depSched = parseAdbTime(raw.departure?.scheduledTime, raw.departure?.scheduledTimeLocal);
	const depActual = parseAdbTime(raw.departure?.actualTime, raw.departure?.actualTimeLocal);
	const depRevised = parseAdbTime(raw.departure?.revisedTime, raw.departure?.revisedTimeLocal);
	const arrSched = parseAdbTime(raw.arrival?.scheduledTime, raw.arrival?.scheduledTimeLocal);
	const arrActual = parseAdbTime(raw.arrival?.actualTime, raw.arrival?.actualTimeLocal);
	const arrRevised = parseAdbTime(raw.arrival?.revisedTime, raw.arrival?.revisedTimeLocal);

	return {
		airline: {
			name: raw.airline?.name ?? 'Unknown',
			iata: raw.airline?.iata ?? '',
		},
		flightNumber: raw.number ?? '',
		status: raw.status ?? 'Unknown',
		departure: {
			airport: {
				name: raw.departure?.airport?.name ?? 'Unknown',
				iata: raw.departure?.airport?.iata ?? '',
				timeZone: raw.departure?.airport?.timeZone,
			},
			scheduledTime: depSched.local,
			actualTime: depActual.local,
			estimatedTime: depRevised.local,
			scheduledTimeUtc: depSched.utc,
			actualTimeUtc: depActual.utc,
			estimatedTimeUtc: depRevised.utc,
			terminal: raw.departure?.terminal,
			gate: raw.departure?.gate,
			delay: raw.departure?.delay,
		},
		arrival: {
			airport: {
				name: raw.arrival?.airport?.name ?? 'Unknown',
				iata: raw.arrival?.airport?.iata ?? '',
				timeZone: raw.arrival?.airport?.timeZone,
			},
			scheduledTime: arrSched.local,
			actualTime: arrActual.local,
			estimatedTime: arrRevised.local,
			scheduledTimeUtc: arrSched.utc,
			actualTimeUtc: arrActual.utc,
			estimatedTimeUtc: arrRevised.utc,
			terminal: raw.arrival?.terminal,
			gate: raw.arrival?.gate,
			baggage: raw.arrival?.baggageBelt,
			delay: raw.arrival?.delay,
		},
		aircraft: raw.aircraft ? {
			model: raw.aircraft.model ?? raw.aircraft.modeS ?? 'Unknown',
			registration: raw.aircraft.reg ?? '',
		} : undefined,
		greatCircleDistance: raw.greatCircleDistance ? {
			km: raw.greatCircleDistance.km,
		} : undefined,
	};
}
