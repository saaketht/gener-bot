import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFlightStatus } from './flightApi';

const mockFlightAwareResponse = {
	flights: [{
		ident: 'DAL456',
		ident_iata: 'DL456',
		ident_icao: 'DAL456',
		operator: 'DAL',
		operator_iata: 'DL',
		operator_icao: 'DAL',
		flight_number: '456',
		status: 'En Route / On Time',
		cancelled: false,
		diverted: false,
		origin: {
			code: 'KATL',
			code_iata: 'ATL',
			name: 'Hartsfield-Jackson Atlanta Intl',
			city: 'Atlanta',
			timezone: 'America/New_York',
		},
		destination: {
			code: 'KLAX',
			code_iata: 'LAX',
			name: 'Los Angeles Intl',
			city: 'Los Angeles',
			timezone: 'America/Los_Angeles',
		},
		scheduled_out: '2026-03-14T13:00:00Z',
		actual_out: '2026-03-14T13:10:00Z',
		scheduled_in: '2026-03-14T18:30:00Z',
		estimated_in: '2026-03-14T18:45:00Z',
		departure_delay: 600,
		arrival_delay: null,
		aircraft_type: 'A320',
		registration: 'N543DL',
		progress_percent: 42,
	}],
};

describe('fetchFlightStatus', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		process.env.FLIGHTAWARE_API_KEY = 'test-key';
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it('returns normalized flight data on success', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockFlightAwareResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result).not.toBeNull();
		expect(result!.flightNumber).toBe('DL456');
		expect(result!.airline.iata).toBe('DL');
		expect(result!.status).toBe('EnRoute');
	});

	it('normalizes departure times correctly', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockFlightAwareResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		// UTC times come through directly from the API
		expect(result!.departure.scheduledTimeUtc).toBe('2026-03-14T13:00:00Z');
		expect(result!.departure.actualTimeUtc).toBe('2026-03-14T13:10:00Z');
		// local times are converted from UTC using the airport timezone
		expect(result!.departure.scheduledTime).toContain('2026-03-14');
		expect(result!.departure.actualTime).toContain('2026-03-14');
	});

	it('normalizes arrival times and estimated', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockFlightAwareResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.arrival.scheduledTimeUtc).toBe('2026-03-14T18:30:00Z');
		expect(result!.arrival.estimatedTimeUtc).toBe('2026-03-14T18:45:00Z');
		expect(result!.arrival.scheduledTime).toContain('2026-03-14');
		expect(result!.arrival.estimatedTime).toContain('2026-03-14');
	});

	it('includes airport metadata', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockFlightAwareResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.departure.airport.iata).toBe('ATL');
		expect(result!.departure.airport.timeZone).toBe('America/New_York');
		expect(result!.arrival.airport.iata).toBe('LAX');
		expect(result!.arrival.airport.name).toBe('Los Angeles Intl');
	});

	it('includes aircraft info', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockFlightAwareResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.aircraft?.model).toBe('A320');
		expect(result!.aircraft?.registration).toBe('N543DL');
	});

	it('converts delay from seconds to minutes', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockFlightAwareResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.departure.delay).toBe(10);
	});

	it('returns null for empty flights array', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ flights: [] }),
		}));

		const result = await fetchFlightStatus('XX999', '2026-03-14');
		expect(result).toBeNull();
	});

	it('returns null for missing flights key', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ message: 'Not found' }),
		}));

		const result = await fetchFlightStatus('XX999', '2026-03-14');
		expect(result).toBeNull();
	});

	it('returns null on HTTP error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result).toBeNull();
	});

	it('returns null on network error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result).toBeNull();
	});

	it('passes correct headers and URL', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockFlightAwareResponse),
		});
		vi.stubGlobal('fetch', mockFetch);

		await fetchFlightStatus('DL456', '2026-03-14');
		const [url, opts] = mockFetch.mock.calls[0];
		expect(url).toContain('aeroapi.flightaware.com');
		expect(url).toContain('DL456');
		expect(url).toContain('2026-03-14');
		expect(opts.headers['x-apikey']).toBe('test-key');
	});

	it('handles missing aircraft gracefully', async () => {
		const noAircraft = {
			flights: [{ ...mockFlightAwareResponse.flights[0], aircraft_type: null, registration: null }],
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(noAircraft),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.aircraft).toBeUndefined();
	});

	it('normalizes cancelled status', async () => {
		const cancelled = {
			flights: [{ ...mockFlightAwareResponse.flights[0], cancelled: true, status: 'Cancelled' }],
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(cancelled),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.status).toBe('Cancelled');
	});

	it('normalizes landed status', async () => {
		const landed = {
			flights: [{ ...mockFlightAwareResponse.flights[0], status: 'Landed / On Time' }],
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(landed),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.status).toBe('Landed');
	});
});
