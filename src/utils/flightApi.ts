import axios from 'axios';
import { FlightData } from '../interfaces/FlightData';
import logger from './logger';

export async function fetchFlightStatus(flightNumber: string, date: string): Promise<FlightData | null> {
	try {
		const response = await axios.get(
			`https://aerodatabox.p.rapidapi.com/flights/number/${flightNumber}/${date}`,
			{
				headers: {
					'x-rapidapi-key': process.env.rapidApiKey,
					'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
				},
				params: {
					withAircraftImage: false,
					withLocation: false,
				},
			},
		);

		const flights = response.data;
		if (!Array.isArray(flights) || flights.length === 0) {
			return null;
		}

		const flight = flights[0];
		return normalize(flight);
	}
	catch (error) {
		logger.error('Failed to fetch flight status', { flightNumber, date, error });
		return null;
	}
}

function parseTime(obj: any, fallbackLocal?: string): { local?: string; utc?: string } {
	if (!obj && !fallbackLocal) return {};
	if (typeof obj === 'string') return { local: obj };
	return {
		local: obj?.local ?? fallbackLocal,
		utc: obj?.utc,
	};
}

function normalize(raw: any): FlightData {
	const depSched = parseTime(raw.departure?.scheduledTime, raw.departure?.scheduledTimeLocal);
	const depActual = parseTime(raw.departure?.actualTime, raw.departure?.actualTimeLocal);
	const depRevised = parseTime(raw.departure?.revisedTime, raw.departure?.revisedTimeLocal);
	const arrSched = parseTime(raw.arrival?.scheduledTime, raw.arrival?.scheduledTimeLocal);
	const arrActual = parseTime(raw.arrival?.actualTime, raw.arrival?.actualTimeLocal);
	const arrRevised = parseTime(raw.arrival?.revisedTime, raw.arrival?.revisedTimeLocal);

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
