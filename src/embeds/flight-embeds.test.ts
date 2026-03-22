import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlightData } from '../interfaces/FlightData';
import {
	getColor,
	getTzAbbr,
	extractTimeStr,
	parseUtcMs,
	formatDuration,
	formatDelay,
	buildProgressBar,
	getFlightTrackingEmbed,
	getFlightErrorEmbed,
} from './flight-embeds';

describe('getColor', () => {
	it('returns status color for known status', () => {
		expect(getColor('Scheduled')).toBe(0x6B7280);
		expect(getColor('EnRoute')).toBe(0x3B82F6);
		expect(getColor('Landed')).toBe(0x10B981);
		expect(getColor('Cancelled')).toBe(0xEF4444);
	});

	it('returns amber for delays > 15 minutes', () => {
		expect(getColor('EnRoute', 30)).toBe(0xF59E0B);
	});

	it('returns normal color for delays <= 15 minutes', () => {
		expect(getColor('EnRoute', 10)).toBe(0x3B82F6);
	});

	it('returns gray for unknown status', () => {
		expect(getColor('SomeNewStatus')).toBe(0x6B7280);
	});
});

describe('getTzAbbr', () => {
	it('returns abbreviation for valid timezone', () => {
		const abbr = getTzAbbr('America/New_York', new Date('2026-01-15'));
		expect(abbr).toBe('EST');
	});

	it('returns empty string for undefined timezone', () => {
		expect(getTzAbbr(undefined)).toBe('');
	});

	it('returns empty string for invalid timezone', () => {
		expect(getTzAbbr('Not/A/Timezone')).toBe('');
	});
});

describe('extractTimeStr', () => {
	it('formats 24h time to 12h with AM/PM', () => {
		expect(extractTimeStr('2026-03-14 14:30')).toContain('2:30 PM');
	});

	it('handles midnight', () => {
		expect(extractTimeStr('2026-03-14 00:45')).toContain('12:45 AM');
	});

	it('handles noon', () => {
		expect(extractTimeStr('2026-03-14 12:00')).toContain('12:00 PM');
	});

	it('returns dash for undefined input', () => {
		expect(extractTimeStr(undefined)).toBe('—');
	});

	it('appends timezone abbreviation when provided', () => {
		const result = extractTimeStr('2026-03-14 14:30', 'America/New_York');
		expect(result).toContain('PM');
		expect(result).toMatch(/E[DS]T/);
	});
});

describe('parseUtcMs', () => {
	it('parses UTC time with Z suffix', () => {
		const ms = parseUtcMs('2026-03-14 00:45Z');
		expect(ms).toBe(new Date('2026-03-14T00:45Z').getTime());
	});

	it('parses UTC time without Z suffix', () => {
		const ms = parseUtcMs('2026-03-14 00:45');
		expect(ms).toBe(new Date('2026-03-14T00:45Z').getTime());
	});

	it('parses T-separated format', () => {
		const ms = parseUtcMs('2026-03-14T00:45Z');
		expect(ms).toBe(new Date('2026-03-14T00:45Z').getTime());
	});

	it('falls back to local time when UTC is undefined', () => {
		const ms = parseUtcMs(undefined, '2026-03-14 10:00');
		expect(ms).not.toBeNaN();
	});

	it('returns NaN when both are undefined', () => {
		expect(parseUtcMs(undefined, undefined)).toBeNaN();
	});
});

describe('formatDuration', () => {
	it('formats minutes under an hour', () => {
		expect(formatDuration(30 * 60000)).toBe('30m');
	});

	it('formats hours and minutes', () => {
		expect(formatDuration(90 * 60000)).toBe('1h 30m');
	});

	it('formats exact hours without minutes', () => {
		expect(formatDuration(120 * 60000)).toBe('2h');
	});

	it('returns <1m for very short durations', () => {
		expect(formatDuration(10000)).toBe('<1m');
	});
});

describe('formatDelay', () => {
	it('returns empty for no delay', () => {
		expect(formatDelay(undefined)).toBe('');
		expect(formatDelay(0)).toBe('');
		expect(formatDelay(-5)).toBe('');
	});

	it('formats minutes delay', () => {
		expect(formatDelay(25)).toContain('25m late');
		expect(formatDelay(25)).toContain('⚠️');
	});

	it('formats hours and minutes delay', () => {
		expect(formatDelay(90)).toContain('1h 30m late');
	});

	it('formats exact hours delay', () => {
		expect(formatDelay(120)).toContain('2h late');
	});
});

// Mock flight data for embed/progress bar tests
const mockFlight: FlightData = {
	airline: { name: 'United Airlines', iata: 'UA' },
	flightNumber: 'UA1234',
	status: 'EnRoute',
	departure: {
		airport: { name: 'San Francisco Intl', iata: 'SFO', timeZone: 'America/Los_Angeles' },
		scheduledTime: '2026-03-14 10:00',
		actualTime: '2026-03-14 10:15',
		scheduledTimeUtc: '2026-03-14 18:00Z',
		actualTimeUtc: '2026-03-14 18:15Z',
		terminal: '3',
		gate: 'G7',
	},
	arrival: {
		airport: { name: 'John F Kennedy Intl', iata: 'JFK', timeZone: 'America/New_York' },
		scheduledTime: '2026-03-14 18:30',
		estimatedTime: '2026-03-14 18:45',
		scheduledTimeUtc: '2026-03-14 22:30Z',
		estimatedTimeUtc: '2026-03-14 22:45Z',
		terminal: '7',
		baggage: '4',
	},
	aircraft: { model: 'Boeing 737-800', registration: 'N12345' },
	greatCircleDistance: { km: 4139 },
};

describe('buildProgressBar', () => {
	let dateSpy: ReturnType<typeof vi.spyOn>;

	afterEach(() => {
		dateSpy?.mockRestore();
	});

	it('shows arrived bar for Landed status', () => {
		const landed = { ...mockFlight, status: 'Landed' };
		const bar = buildProgressBar(landed);
		expect(bar).toContain('Arrived');
		expect(bar).toContain('✅');
	});

	it('shows cancelled bar for Cancelled status', () => {
		const cancelled = { ...mockFlight, status: 'Cancelled' };
		const bar = buildProgressBar(cancelled);
		expect(bar).toContain('Cancelled');
		expect(bar).toContain('❌');
	});

	it('shows departs in X when before departure', () => {
		// Set "now" to 1 hour before departure
		dateSpy = vi.spyOn(Date, 'now').mockReturnValue(
			new Date('2026-03-14T17:15Z').getTime(),
		);
		const bar = buildProgressBar(mockFlight);
		expect(bar).toContain('Departs in');
		expect(bar).toContain('✈️');
	});

	it('shows percentage and ETA when in flight', () => {
		// Set "now" to midway through flight
		const depMs = new Date('2026-03-14T18:15Z').getTime();
		const arrMs = new Date('2026-03-14T22:45Z').getTime();
		const midpoint = depMs + (arrMs - depMs) / 2;
		dateSpy = vi.spyOn(Date, 'now').mockReturnValue(midpoint);
		const bar = buildProgressBar(mockFlight);
		expect(bar).toContain('50%');
		expect(bar).toContain('left');
		expect(bar).toContain('✈️');
	});

	it('returns plain bar when times are missing', () => {
		const noTimes: FlightData = {
			...mockFlight,
			departure: { ...mockFlight.departure, actualTimeUtc: undefined, scheduledTimeUtc: undefined, actualTime: undefined, scheduledTime: undefined },
			arrival: { ...mockFlight.arrival, estimatedTimeUtc: undefined, scheduledTimeUtc: undefined, estimatedTime: undefined, scheduledTime: undefined },
		};
		const bar = buildProgressBar(noTimes);
		expect(bar).toContain('─');
	});
});

describe('getFlightTrackingEmbed', () => {
	beforeEach(() => {
		// Fix time for consistent progress bar output
		vi.spyOn(Date, 'now').mockReturnValue(
			new Date('2026-03-14T20:00Z').getTime(),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('creates embed with airline and flight number title', () => {
		const embed = getFlightTrackingEmbed(mockFlight);
		const json = embed.toJSON();
		expect(json.title).toBe('United Airlines UA1234');
	});

	it('includes route line in description', () => {
		const embed = getFlightTrackingEmbed(mockFlight);
		const desc = embed.toJSON().description!;
		expect(desc).toContain('SFO');
		expect(desc).toContain('JFK');
	});

	it('includes departure and arrival fields', () => {
		const embed = getFlightTrackingEmbed(mockFlight);
		const fields = embed.toJSON().fields!;
		const names = fields.map(f => f.name);
		expect(names).toContain('🛫 Departure');
		expect(names).toContain('🛬 Arrival');
	});

	it('shows terminal, gate, and baggage info', () => {
		const embed = getFlightTrackingEmbed(mockFlight);
		const fields = embed.toJSON().fields!;
		const depField = fields.find(f => f.name === '🛫 Departure')!;
		const arrField = fields.find(f => f.name === '🛬 Arrival')!;
		expect(depField.value).toContain('T3');
		expect(depField.value).toContain('Gate G7');
		expect(arrField.value).toContain('T7');
		expect(arrField.value).toContain('Belt 4');
	});

	it('shows aircraft and distance in footer', () => {
		const embed = getFlightTrackingEmbed(mockFlight);
		const footer = embed.toJSON().footer!.text;
		expect(footer).toContain('Boeing 737-800');
		expect(footer).toContain('N12345');
		expect(footer).toContain('4,139 km');
	});

	it('shows strikethrough for delayed departure', () => {
		const embed = getFlightTrackingEmbed(mockFlight);
		const fields = embed.toJSON().fields!;
		const depField = fields.find(f => f.name === '🛫 Departure')!;
		// actualTime differs from scheduledTime, so should show strikethrough
		expect(depField.value).toContain('~~');
	});

	it('sets amber color for significant delay', () => {
		const delayed = {
			...mockFlight,
			departure: { ...mockFlight.departure, delay: 45 },
		};
		const embed = getFlightTrackingEmbed(delayed);
		expect(embed.toJSON().color).toBe(0xF59E0B);
	});
});

describe('getFlightErrorEmbed', () => {
	it('creates red error embed with message', () => {
		const embed = getFlightErrorEmbed('Flight not found');
		const json = embed.toJSON();
		expect(json.color).toBe(0xEF4444);
		expect(json.description).toBe('Flight not found');
	});
});
