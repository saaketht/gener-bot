import { describe, it, expect } from 'vitest';
import { parseDuration } from './reminders';

describe('parseDuration', () => {
	it('parses single units', () => {
		expect(parseDuration('10m')).toBe(10 * 60 * 1000);
		expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
		expect(parseDuration('30s')).toBe(30 * 1000);
		expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
		expect(parseDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
	});

	it('parses compound durations', () => {
		expect(parseDuration('1h30m')).toBe(90 * 60 * 1000);
		expect(parseDuration('2d12h')).toBe(60 * 60 * 60 * 1000);
	});

	it('is case-insensitive and trims', () => {
		expect(parseDuration(' 1H ')).toBe(60 * 60 * 1000);
	});

	it('rejects invalid input', () => {
		expect(parseDuration('10 minutes')).toBeNull();
		expect(parseDuration('1hr')).toBeNull();
		expect(parseDuration('h')).toBeNull();
		expect(parseDuration('')).toBeNull();
		expect(parseDuration('0m')).toBeNull();
		expect(parseDuration('tomorrow')).toBeNull();
	});
});
