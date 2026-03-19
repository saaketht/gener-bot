import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchImage } from './imageSearch';

const mockResults = Array.from({ length: 10 }, (_, i) => ({
	properties: { url: `https://example.com/image${i}.jpg` },
}));

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('searchImage', () => {
	it('returns a URL on success', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ results: mockResults }),
		}));

		const url = await searchImage('cats');
		expect(url).toMatch(/^https:\/\/example\.com\/image\d\.jpg$/);
	});

	it('returns specific index when provided', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ results: mockResults }),
		}));

		const url = await searchImage('cats', 3);
		expect(url).toBe('https://example.com/image3.jpg');
	});

	it('clamps index to results length', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ results: mockResults }),
		}));

		const url = await searchImage('cats', 999);
		expect(url).toBe('https://example.com/image9.jpg');
	});

	it('returns null when no results', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ results: [] }),
		}));

		const url = await searchImage('nonexistent');
		expect(url).toBeNull();
	});

	it('throws on non-OK response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
		}));

		await expect(searchImage('cats')).rejects.toThrow('API returned 429');
	});

	it('sends correct headers and query params', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ results: mockResults }),
		});
		vi.stubGlobal('fetch', mockFetch);

		await searchImage('cute dogs');

		const [url] = mockFetch.mock.calls[0];
		expect(url).toContain('q=cute+dogs');
		expect(url).toContain('count=200');
	});
});
