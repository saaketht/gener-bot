import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeSymbol, toAssetType, getPrice, getAssetPrice } from './priceApi';

// --- normalizeSymbol ---

describe('normalizeSymbol', () => {
	it('uppercases stock symbols', () => {
		expect(normalizeSymbol('spy', 'stock')).toBe('SPY');
		expect(normalizeSymbol('aapl', 'stock')).toBe('AAPL');
	});

	it('appends -USD to crypto symbols', () => {
		expect(normalizeSymbol('btc', 'crypto')).toBe('BTC-USD');
		expect(normalizeSymbol('ETH', 'crypto')).toBe('ETH-USD');
	});

	it('does not double-append -USD to crypto symbols', () => {
		expect(normalizeSymbol('BTC-USD', 'crypto')).toBe('BTC-USD');
	});

	it('maps known commodity aliases to futures symbols', () => {
		expect(normalizeSymbol('WTI', 'commodity')).toBe('CL=F');
		expect(normalizeSymbol('OIL', 'commodity')).toBe('CL=F');
		expect(normalizeSymbol('CRUDE', 'commodity')).toBe('CL=F');
		expect(normalizeSymbol('BRENT', 'commodity')).toBe('BZ=F');
		expect(normalizeSymbol('NATURAL_GAS', 'commodity')).toBe('NG=F');
		expect(normalizeSymbol('NG', 'commodity')).toBe('NG=F');
		expect(normalizeSymbol('GAS', 'commodity')).toBe('NG=F');
		expect(normalizeSymbol('GOLD', 'commodity')).toBe('GC=F');
		expect(normalizeSymbol('SILVER', 'commodity')).toBe('SI=F');
		expect(normalizeSymbol('COPPER', 'commodity')).toBe('HG=F');
	});

	it('passes through unknown commodity symbols as-is', () => {
		expect(normalizeSymbol('WHEAT', 'commodity')).toBe('WHEAT');
	});
});

// --- toAssetType ---

describe('toAssetType', () => {
	it('passes through valid types', () => {
		expect(toAssetType('stock')).toBe('stock');
		expect(toAssetType('crypto')).toBe('crypto');
		expect(toAssetType('commodity')).toBe('commodity');
	});

	it('coerces unknown types (e.g. legacy etf) to stock', () => {
		expect(toAssetType('etf')).toBe('stock');
		expect(toAssetType('')).toBe('stock');
		expect(toAssetType('unknown')).toBe('stock');
	});
});

// --- getPrice / getAssetPrice (mocked fetch) ---

const finnhubResponse = {
	c: 593.25,
	pc: 589.0,
	h: 595.5,
	l: 588.0,
};

const yahooResponse = {
	chart: {
		result: [{
			meta: {
				regularMarketPrice: 593.25,
				chartPreviousClose: 589.0,
				regularMarketDayHigh: 595.5,
				regularMarketDayLow: 588.0,
				fiftyTwoWeekHigh: 613.23,
				fiftyTwoWeekLow: 490.68,
			},
		}],
	},
};

function makeFetch(finnhub: object | null, yahoo: object | null) {
	return vi.fn().mockImplementation((url: string) => {
		if (url.includes('finnhub.io')) {
			if (!finnhub) return Promise.resolve({ ok: false, status: 500 });
			return Promise.resolve({ ok: true, json: () => Promise.resolve(finnhub) });
		}
		if (url.includes('yahoo.com')) {
			if (!yahoo) return Promise.resolve({ ok: false, status: 404 });
			return Promise.resolve({ ok: true, json: () => Promise.resolve(yahoo) });
		}
		return Promise.resolve({ ok: false, status: 404 });
	});
}

beforeEach(() => {
	vi.unstubAllGlobals();
	process.env.FINNHUB_API_KEY = 'test-key';
});

describe('getPrice', () => {
	it('returns Finnhub data enriched with Yahoo 52-week when both succeed', async () => {
		vi.stubGlobal('fetch', makeFetch(finnhubResponse, yahooResponse));
		const result = await getPrice('SPY');
		expect(result).not.toBeNull();
		expect(result!.source).toBe('finnhub');
		expect(result!.price).toBe(593.25);
		expect(result!.week52_high).toBe(613.23);
		expect(result!.week52_low).toBe(490.68);
	});

	it('falls back to Yahoo when Finnhub returns null price', async () => {
		vi.stubGlobal('fetch', makeFetch({ c: 0, pc: 0, h: 0, l: 0 }, yahooResponse));
		const result = await getPrice('BTC-USD');
		expect(result).not.toBeNull();
		expect(result!.source).toBe('yahoo');
	});

	it('falls back to Yahoo when Finnhub HTTP fails', async () => {
		vi.stubGlobal('fetch', makeFetch(null, yahooResponse));
		const result = await getPrice('BTC-USD');
		expect(result).not.toBeNull();
		expect(result!.source).toBe('yahoo');
	});

	it('returns null when both APIs fail', async () => {
		vi.stubGlobal('fetch', makeFetch(null, null));
		const result = await getPrice('INVALID');
		expect(result).toBeNull();
	});

	it('returns null when FINNHUB_API_KEY is missing and Yahoo also fails', async () => {
		delete process.env.FINNHUB_API_KEY;
		vi.stubGlobal('fetch', makeFetch(null, null));
		const result = await getPrice('SPY');
		expect(result).toBeNull();
	});
});

describe('getAssetPrice', () => {
	it('stamps original display symbol, keeps normalized as query_symbol', async () => {
		vi.stubGlobal('fetch', makeFetch(null, yahooResponse));
		const result = await getAssetPrice('btc', 'crypto');
		expect(result).not.toBeNull();
		expect(result!.symbol).toBe('BTC');
		expect(result!.query_symbol).toBe('BTC-USD');
	});

	it('normalizes commodity symbol before fetching', async () => {
		const fetchMock = makeFetch(null, yahooResponse);
		vi.stubGlobal('fetch', fetchMock);
		await getAssetPrice('WTI', 'commodity');
		const calledUrls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
		expect(calledUrls.some((u: string) => u.includes('CL%3DF') || u.includes('CL=F'))).toBe(true);
	});

	it('returns null when price fetch fails', async () => {
		vi.stubGlobal('fetch', makeFetch(null, null));
		const result = await getAssetPrice('INVALID', 'stock');
		expect(result).toBeNull();
	});
});
