import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFlightStatus } from './flightApi';

const mockApiResponse = [{
	airline: { name: 'Delta Air Lines', iata: 'DL' },
	number: 'DL456',
	status: 'EnRoute',
	departure: {
		airport: { name: 'Hartsfield-Jackson Atlanta Intl', iata: 'ATL', timeZone: 'America/New_York' },
		scheduledTime: { local: '2026-03-14 08:00', utc: '2026-03-14 13:00Z' },
		actualTime: { local: '2026-03-14 08:10', utc: '2026-03-14 13:10Z' },
		terminal: 'S',
		gate: 'A12',
		delay: 10,
	},
	arrival: {
		airport: { name: 'Los Angeles Intl', iata: 'LAX', timeZone: 'America/Los_Angeles' },
		scheduledTime: { local: '2026-03-14 10:30', utc: '2026-03-14 18:30Z' },
		revisedTime: { local: '2026-03-14 10:45', utc: '2026-03-14 18:45Z' },
		terminal: '5',
		baggageBelt: '3',
	},
	aircraft: { model: 'Airbus A320', reg: 'N543DL' },
	greatCircleDistance: { km: 3107 },
}];

describe('fetchFlightStatus', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		process.env.rapidApiKey = 'test-key';
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it('returns normalized flight data on success', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result).not.toBeNull();
		expect(result!.flightNumber).toBe('DL456');
		expect(result!.airline.name).toBe('Delta Air Lines');
		expect(result!.status).toBe('EnRoute');
	});

	it('normalizes departure times correctly', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.departure.scheduledTime).toBe('2026-03-14 08:00');
		expect(result!.departure.scheduledTimeUtc).toBe('2026-03-14 13:00Z');
		expect(result!.departure.actualTime).toBe('2026-03-14 08:10');
		expect(result!.departure.actualTimeUtc).toBe('2026-03-14 13:10Z');
	});

	it('normalizes arrival times and revised/estimated', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.arrival.scheduledTime).toBe('2026-03-14 10:30');
		expect(result!.arrival.estimatedTime).toBe('2026-03-14 10:45');
		expect(result!.arrival.estimatedTimeUtc).toBe('2026-03-14 18:45Z');
	});

	it('includes airport metadata', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.departure.airport.iata).toBe('ATL');
		expect(result!.departure.airport.timeZone).toBe('America/New_York');
		expect(result!.arrival.airport.iata).toBe('LAX');
		expect(result!.arrival.terminal).toBe('5');
		expect(result!.arrival.baggage).toBe('3');
	});

	it('includes aircraft and distance', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.aircraft?.model).toBe('Airbus A320');
		expect(result!.aircraft?.registration).toBe('N543DL');
		expect(result!.greatCircleDistance?.km).toBe(3107);
	});

	it('returns null for empty response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve([]),
		}));

		const result = await fetchFlightStatus('XX999', '2026-03-14');
		expect(result).toBeNull();
	});

	it('returns null for non-array response', async () => {
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
			json: () => Promise.resolve(mockApiResponse),
		});
		vi.stubGlobal('fetch', mockFetch);

		await fetchFlightStatus('DL456', '2026-03-14');
		const [url, opts] = mockFetch.mock.calls[0];
		expect(url).toContain('aerodatabox.p.rapidapi.com');
		expect(url).toContain('DL456');
		expect(url).toContain('2026-03-14');
		expect(opts.headers['x-rapidapi-key']).toBe('test-key');
	});

	it('handles missing aircraft gracefully', async () => {
		const noAircraft = [{ ...mockApiResponse[0], aircraft: undefined }];
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(noAircraft),
		}));

		const result = await fetchFlightStatus('DL456', '2026-03-14');
		expect(result!.aircraft).toBeUndefined();
	});
});
