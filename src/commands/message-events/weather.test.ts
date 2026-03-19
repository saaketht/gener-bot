import { describe, it, expect } from 'vitest';
import { tempToColor, tempToEmoji, xterm256ToRgb, nearestBasicAnsi, convertAnsi } from './weather';

describe('tempToColor', () => {
	it('returns icy blue for freezing temps', () => {
		expect(tempToColor(0)).toBe(0x4FC3F7);
		expect(tempToColor(32)).toBe(0x4FC3F7);
	});

	it('returns cool blue for cold temps', () => {
		expect(tempToColor(33)).toBe(0x81D4FA);
		expect(tempToColor(50)).toBe(0x81D4FA);
	});

	it('returns mild green for comfortable temps', () => {
		expect(tempToColor(60)).toBe(0xAED581);
		expect(tempToColor(65)).toBe(0xAED581);
	});

	it('returns warm yellow for warm temps', () => {
		expect(tempToColor(70)).toBe(0xFFD54F);
		expect(tempToColor(80)).toBe(0xFFD54F);
	});

	it('returns hot orange for hot temps', () => {
		expect(tempToColor(90)).toBe(0xFF8A65);
		expect(tempToColor(95)).toBe(0xFF8A65);
	});

	it('returns scorching red for extreme heat', () => {
		expect(tempToColor(96)).toBe(0xE53935);
		expect(tempToColor(120)).toBe(0xE53935);
	});

	it('handles boundary values exactly', () => {
		expect(tempToColor(32)).toBe(0x4FC3F7);
		expect(tempToColor(33)).toBe(0x81D4FA);
		expect(tempToColor(95)).toBe(0xFF8A65);
		expect(tempToColor(96)).toBe(0xE53935);
	});
});

describe('tempToEmoji', () => {
	it('returns correct emoji for each range', () => {
		expect(tempToEmoji(0)).toBe('🥶');
		expect(tempToEmoji(40)).toBe('❄️');
		expect(tempToEmoji(60)).toBe('🌤️');
		expect(tempToEmoji(75)).toBe('☀️');
		expect(tempToEmoji(90)).toBe('🔥');
		expect(tempToEmoji(100)).toBe('🌡️');
	});
});

describe('xterm256ToRgb', () => {
	it('converts standard 16 colors', () => {
		expect(xterm256ToRgb(0)).toEqual([0, 0, 0]);
		expect(xterm256ToRgb(1)).toEqual([128, 0, 0]);
		expect(xterm256ToRgb(15)).toEqual([255, 255, 255]);
	});

	it('converts 6x6x6 color cube', () => {
		// Index 16 = (0,0,0) in cube = pure black
		expect(xterm256ToRgb(16)).toEqual([0, 0, 0]);
		// Index 196 = (5,0,0) = bright red
		expect(xterm256ToRgb(196)).toEqual([255, 0, 0]);
		// Index 21 = (0,0,5) = bright blue
		expect(xterm256ToRgb(21)).toEqual([0, 0, 255]);
	});

	it('converts greyscale ramp', () => {
		// 232 = darkest grey
		expect(xterm256ToRgb(232)).toEqual([8, 8, 8]);
		// 255 = lightest grey
		expect(xterm256ToRgb(255)).toEqual([238, 238, 238]);
	});

	it('handles wttr.in common codes', () => {
		// 226 = yellow (sun)
		const [r, g, b] = xterm256ToRgb(226);
		expect(r).toBeGreaterThan(200);
		expect(g).toBeGreaterThan(200);
		expect(b).toBeLessThan(100);

		// 240 = dark grey (clouds)
		const grey = xterm256ToRgb(240);
		expect(grey[0]).toBe(grey[1]);
		expect(grey[1]).toBe(grey[2]);
	});
});

describe('nearestBasicAnsi', () => {
	it('maps yellow xterm to yellow basic', () => {
		// 226 (yellow sun art) should map to 33 (yellow)
		expect(nearestBasicAnsi(226)).toBe(33);
	});

	it('maps dark grey to dark grey basic', () => {
		// 240 (cloud grey) should map to 30 (dark)
		expect(nearestBasicAnsi(240)).toBe(30);
	});

	it('maps bright red to red basic', () => {
		expect(nearestBasicAnsi(196)).toBe(31);
	});

	it('maps bright blue to blue basic', () => {
		expect(nearestBasicAnsi(21)).toBe(34);
	});

	it('maps white to white basic', () => {
		expect(nearestBasicAnsi(15)).toBe(37);
	});
});

describe('convertAnsi', () => {
	it('converts 256-color escapes to basic ANSI', () => {
		const input = '\x1b[38;5;226mhello\x1b[0m';
		const result = convertAnsi(input);
		expect(result).toContain('\x1b[33m');
		expect(result).toContain('hello');
		expect(result).toContain('\x1b[0m');
	});

	it('passes through bold and reset', () => {
		const input = '\x1b[1mBOLD\x1b[0m';
		expect(convertAnsi(input)).toBe('\x1b[1mBOLD\x1b[0m');
	});

	it('handles combined bold + 256-color', () => {
		const input = '\x1b[38;5;240;1mcloud\x1b[0m';
		const result = convertAnsi(input);
		// Should have the mapped color + bold
		expect(result).toMatch(/\x1b\[\d+;1mcloud/);
	});

	it('returns text unchanged if no escapes', () => {
		expect(convertAnsi('plain text')).toBe('plain text');
	});

	it('handles empty string', () => {
		expect(convertAnsi('')).toBe('');
	});

	it('handles real wttr.in output snippet', () => {
		const input = '\x1b[38;5;226m    \\   /    \x1b[0m Sunny';
		const result = convertAnsi(input);
		// Should contain the sun art and "Sunny"
		expect(result).toContain('\\   /');
		expect(result).toContain('Sunny');
		// Should not contain 38;5;226 anymore
		expect(result).not.toContain('38;5;226');
	});
});
