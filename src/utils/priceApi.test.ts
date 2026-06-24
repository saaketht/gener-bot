import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeSymbol, toAssetType, getPrice, getAssetPrice, getHistory, getFundamentals, clearPriceCache, clearHistoryCache, clearFundamentalsCache } from './priceApi';

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

// Fixed clock so deriveSession() produces deterministic results — pick a time
// well inside US regular hours on a weekday.
const REGULAR_NOW = Date.UTC(2025, 0, 6, 18, 0, 0) / 1000;
const REG_START = Date.UTC(2025, 0, 6, 14, 30, 0) / 1000;
const REG_END = Date.UTC(2025, 0, 6, 21, 0, 0) / 1000;
const PRE_START = Date.UTC(2025, 0, 6, 9, 0, 0) / 1000;
const POST_END = Date.UTC(2025, 0, 7, 1, 0, 0) / 1000;

const yahooMeta = {
	regularMarketPrice: 593.25,
	chartPreviousClose: 589.0,
	regularMarketDayHigh: 595.5,
	regularMarketDayLow: 588.0,
	regularMarketOpen: 590.10,
	regularMarketVolume: 42_500_000,
	fiftyTwoWeekHigh: 613.23,
	fiftyTwoWeekLow: 490.68,
	longName: 'SPDR S&P 500 ETF Trust',
	currentTradingPeriod: {
		pre: { start: PRE_START, end: REG_START },
		regular: { start: REG_START, end: REG_END },
		post: { start: REG_END, end: POST_END },
	},
};

const yahooResponse = {
	chart: {
		result: [{
			meta: yahooMeta,
			timestamp: [REG_START, REG_START + 300, REG_START + 600],
			indicators: { quote: [{ close: [592.0, 592.5, 593.25] }] },
		}],
	},
};

const finnhubMetricResponse = {
	metric: {
		// marketCapitalization is in millions USD: 542000 → $542B
		marketCapitalization: 542000,
		peBasicExclExtraTTM: 28.5,
		currentDividendYieldTTM: 0.55,
	},
};

const earningsResponse = { earningsCalendar: [{ date: '2026-07-29' }] };

function makeFetch(finnhub: object | null, yahoo: object | null, finnhubMetric: object | null = finnhubMetricResponse, earnings: object | null = earningsResponse) {
	return vi.fn().mockImplementation((url: string) => {
		if (url.includes('finnhub.io/api/v1/stock/metric')) {
			if (!finnhubMetric) return Promise.resolve({ ok: false, status: 500 });
			return Promise.resolve({ ok: true, json: () => Promise.resolve(finnhubMetric) });
		}
		if (url.includes('finnhub.io/api/v1/calendar/earnings')) {
			if (!earnings) return Promise.resolve({ ok: false, status: 403 });
			return Promise.resolve({ ok: true, json: () => Promise.resolve(earnings) });
		}
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
	vi.useFakeTimers();
	vi.setSystemTime(new Date(REGULAR_NOW * 1000));
	clearPriceCache();
	clearFundamentalsCache();
	process.env.FINNHUB_API_KEY = 'test-key';
});

describe('getPrice', () => {
	it('returns Yahoo data with name and 52-week when Yahoo succeeds', async () => {
		vi.stubGlobal('fetch', makeFetch(finnhubResponse, yahooResponse));
		const result = await getPrice('SPY');
		expect(result).not.toBeNull();
		expect(result!.source).toBe('yahoo');
		expect(result!.price).toBe(593.25);
		expect(result!.name).toBe('SPDR S&P 500 ETF Trust');
		expect(result!.week52_high).toBe(613.23);
		expect(result!.week52_low).toBe(490.68);
		expect(result!.session).toBe('regular');
	});

	it('surfaces open, volume, market_cap, and pe_ratio for stocks', async () => {
		vi.stubGlobal('fetch', makeFetch(finnhubResponse, yahooResponse));
		const result = await getPrice('SPY');
		expect(result!.open).toBe(590.10);
		expect(result!.volume).toBe(42_500_000);
		expect(result!.market_cap).toBe(542_000 * 1e6);
		expect(result!.pe_ratio).toBe(28.5);
		expect(result!.dividend_yield).toBe(0.55);
		expect(result!.next_earnings).toBe(Math.floor(Date.parse('2026-07-29T00:00:00Z') / 1000));
	});

	it('derives open from first regular-session bar when meta.regularMarketOpen is missing', async () => {
		const noOpenMeta = { ...yahooMeta };
		delete (noOpenMeta as any).regularMarketOpen;
		const response = {
			chart: { result: [{
				meta: noOpenMeta,
				timestamp: [REG_START - 600, REG_START, REG_START + 300, REG_START + 600],
				indicators: { quote: [{ close: [580.5, 591.2, 592.5, 593.25] }] },
			}] },
		};
		vi.stubGlobal('fetch', makeFetch(null, response));
		const result = await getPrice('SPY');
		expect(result!.open).toBe(591.2);
	});

	it('surfaces negative P/E rather than dropping it', async () => {
		const negPeResponse = {
			metric: { marketCapitalization: 5000, peBasicExclExtraTTM: -42.3 },
		};
		vi.stubGlobal('fetch', makeFetch(null, yahooResponse, negPeResponse));
		const result = await getPrice('SPY');
		expect(result!.pe_ratio).toBe(-42.3);
	});

	it('skips Finnhub metric fetch for crypto symbols', async () => {
		const fetchMock = makeFetch(null, yahooResponse);
		vi.stubGlobal('fetch', fetchMock);
		await getPrice('BTC-USD');
		const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
		expect(urls.some(u => u.includes('stock/metric'))).toBe(false);
	});

	it('still returns price data when Finnhub metric call fails', async () => {
		vi.stubGlobal('fetch', makeFetch(null, yahooResponse, null));
		const result = await getPrice('SPY');
		expect(result).not.toBeNull();
		expect(result!.market_cap).toBeUndefined();
		expect(result!.pe_ratio).toBeUndefined();
	});

	it('serves second call within TTL from cache without re-fetching', async () => {
		const fetchMock = makeFetch(null, yahooResponse);
		vi.stubGlobal('fetch', fetchMock);
		await getPrice('SPY');
		const firstCallCount = fetchMock.mock.calls.length;
		await getPrice('SPY');
		expect(fetchMock.mock.calls.length).toBe(firstCallCount);
	});

	it('force=true bypasses the price cache', async () => {
		const fetchMock = makeFetch(null, yahooResponse);
		vi.stubGlobal('fetch', fetchMock);
		await getPrice('SPY');
		const firstCallCount = fetchMock.mock.calls.length;
		await getPrice('SPY', true);
		expect(fetchMock.mock.calls.length).toBeGreaterThan(firstCallCount);
	});

	it('refetches after TTL expires', async () => {
		const fetchMock = makeFetch(null, yahooResponse);
		vi.stubGlobal('fetch', fetchMock);
		await getPrice('SPY');
		const firstCallCount = fetchMock.mock.calls.length;
		vi.setSystemTime(new Date(REGULAR_NOW * 1000 + 31_000));
		await getPrice('SPY');
		expect(fetchMock.mock.calls.length).toBeGreaterThan(firstCallCount);
	});

	it('bypasses cache when cached entry is from an extended-hours session', async () => {
		vi.setSystemTime(new Date((REG_END + 600) * 1000));
		const postResponse = {
			chart: { result: [{
				meta: yahooMeta,
				timestamp: [REG_START, REG_END + 600],
				indicators: { quote: [{ close: [593.25, 600.10] }] },
			}] },
		};
		const fetchMock = makeFetch(null, postResponse);
		vi.stubGlobal('fetch', fetchMock);
		await getPrice('SPY');
		const firstCallCount = fetchMock.mock.calls.length;
		await getPrice('SPY');
		expect(fetchMock.mock.calls.length).toBeGreaterThan(firstCallCount);
	});

	it('attaches intraday series when timestamps and closes are present', async () => {
		vi.stubGlobal('fetch', makeFetch(null, yahooResponse));
		const result = await getPrice('SPY');
		expect(result!.intraday).toBeDefined();
		expect(result!.intraday!.timestamps.length).toBe(3);
		expect(result!.intraday!.closes[2]).toBe(593.25);
		expect(result!.intraday!.regular_start).toBe(REG_START);
		expect(result!.intraday!.regular_end).toBe(REG_END);
	});

	it('attaches the intraday volume series when present and length-matched', async () => {
		const withVol = {
			chart: { result: [{
				meta: yahooMeta,
				timestamp: [REG_START, REG_START + 300, REG_START + 600],
				indicators: { quote: [{ close: [592.0, 592.5, 593.25], volume: [1000, 2000, 3000] }] },
			}] },
		};
		vi.stubGlobal('fetch', makeFetch(null, withVol));
		const result = await getPrice('SPY');
		expect(result!.intraday!.volumes).toEqual([1000, 2000, 3000]);
	});

	it('derives post-market headline from the post-session intraday bars', async () => {
		vi.setSystemTime(new Date((REG_END + 600) * 1000));
		const postResponse = {
			chart: { result: [{
				meta: yahooMeta,
				timestamp: [REG_START, REG_END + 300, REG_END + 600],
				indicators: { quote: [{ close: [593.25, 599.0, 600.10] }] },
			}] },
		};
		vi.stubGlobal('fetch', makeFetch(null, postResponse));
		const result = await getPrice('SPY');
		expect(result!.price).toBe(600.10);
		expect(result!.regular_close).toBe(593.25);
		expect(result!.post_market_price).toBe(600.10);
		// Change is measured against the regular close, not prev close.
		expect(result!.change_pct).toBeCloseTo(((600.10 - 593.25) / 593.25) * 100, 5);
		expect(result!.session).toBe('post');
	});

	it('derives pre-market headline from the pre-session intraday bars', async () => {
		vi.setSystemTime(new Date((PRE_START + 600) * 1000));
		const preResponse = {
			chart: { result: [{
				meta: yahooMeta,
				timestamp: [PRE_START, PRE_START + 300, PRE_START + 600],
				indicators: { quote: [{ close: [585.0, 584.0, 583.5] }] },
			}] },
		};
		vi.stubGlobal('fetch', makeFetch(null, preResponse));
		const result = await getPrice('SPY');
		expect(result!.price).toBe(583.5);
		expect(result!.pre_market_price).toBe(583.5);
		expect(result!.regular_close).toBe(593.25);
		expect(result!.change_pct).toBeCloseTo(((583.5 - 593.25) / 593.25) * 100, 5);
		expect(result!.session).toBe('pre');
	});

	it('falls back to Finnhub when Yahoo fails', async () => {
		vi.stubGlobal('fetch', makeFetch(finnhubResponse, null));
		const result = await getPrice('SPY');
		expect(result).not.toBeNull();
		expect(result!.source).toBe('finnhub');
		expect(result!.price).toBe(593.25);
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

// --- getHistory (mocked fetch) ---

function historyResponse(opts: {
	timestamps: number[];
	closes: (number | null)[];
	opens?: (number | null)[];
	highs?: (number | null)[];
	lows?: (number | null)[];
	volumes?: (number | null)[];
	regularMarketPrice?: number;
	regularMarketTime?: number;
	fiftyTwoWeekHigh?: number;
	fiftyTwoWeekLow?: number;
	name?: string;
}) {
	return {
		ok: true,
		json: () => Promise.resolve({
			chart: { result: [{
				meta: {
					longName: opts.name,
					regularMarketPrice: opts.regularMarketPrice,
					regularMarketTime: opts.regularMarketTime,
					fiftyTwoWeekHigh: opts.fiftyTwoWeekHigh,
					fiftyTwoWeekLow: opts.fiftyTwoWeekLow,
				},
				timestamp: opts.timestamps,
				indicators: { quote: [{
					close: opts.closes,
					open: opts.opens,
					high: opts.highs,
					low: opts.lows,
					volume: opts.volumes,
				}] },
			}] },
		}),
	};
}

function chartCalls(mock: ReturnType<typeof vi.fn>): number {
	return mock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('v8/finance/chart')).length;
}

describe('getHistory', () => {
	beforeEach(() => clearHistoryCache());

	it('returns null for an intraday-only / unknown range without fetching', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect(await getHistory('AAPL', '1d', 'stock')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('builds points, drops nulls, keeps the friendly symbol and range', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(historyResponse({
			timestamps: [100, 200, 300],
			closes: [10, null, 12],
			name: 'Apple Inc.',
		}))));
		const h = await getHistory('AAPL', '1y', 'stock');
		expect(h!.symbol).toBe('AAPL');
		expect(h!.range).toBe('1y');
		expect(h!.name).toBe('Apple Inc.');
		expect(h!.points).toEqual([{ t: 100, price: 10 }, { t: 300, price: 12 }]);
	});

	it('normalizes crypto and commodity symbols into the Yahoo query form', async () => {
		const fetchMock = vi.fn(() => Promise.resolve(historyResponse({ timestamps: [1, 2], closes: [1, 2] })));
		vi.stubGlobal('fetch', fetchMock);

		const btc = await getHistory('btc', '1y', 'crypto');
		expect(btc!.query_symbol).toBe('BTC-USD');
		expect(fetchMock.mock.calls[0][0]).toContain('BTC-USD');

		const wti = await getHistory('WTI', '5y', 'commodity');
		expect(wti!.query_symbol).toBe('CL=F');
		expect(fetchMock.mock.calls[1][0]).toContain(encodeURIComponent('CL=F'));
	});

	it('appends the live tick when it is newer than the last candle', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(historyResponse({
			timestamps: [100, 200],
			closes: [10, 11],
			regularMarketPrice: 12.5,
			regularMarketTime: 300,
		}))));
		const h = await getHistory('SPY', '5y', 'stock');
		expect(h!.points[h!.points.length - 1]).toEqual({ t: 300, price: 12.5 });
	});

	it('does not append a stale live tick at or before the last candle', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(historyResponse({
			timestamps: [100, 200],
			closes: [10, 11],
			regularMarketPrice: 99,
			regularMarketTime: 200,
		}))));
		const h = await getHistory('QQQ', '5y', 'stock');
		expect(h!.points).toEqual([{ t: 100, price: 10 }, { t: 200, price: 11 }]);
	});

	it('returns null when fewer than 2 points survive', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(historyResponse({ timestamps: [1], closes: [10] }))));
		expect(await getHistory('TSLA', '1y', 'stock')).toBeNull();
	});

	it('returns null on a non-ok response', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
		expect(await getHistory('NOPE', '1y', 'stock')).toBeNull();
	});

	it('serves a second call within TTL from cache', async () => {
		const fetchMock = vi.fn(() => Promise.resolve(historyResponse({ timestamps: [1, 2], closes: [1, 2] })));
		vi.stubGlobal('fetch', fetchMock);
		await getHistory('NVDA', '1y', 'stock');
		await getHistory('NVDA', '1y', 'stock');
		// Count only the Yahoo history fetch — fundamentals are a separate cached call.
		expect(chartCalls(fetchMock)).toBe(1);
	});

	it('force=true bypasses the history cache', async () => {
		const fetchMock = vi.fn(() => Promise.resolve(historyResponse({ timestamps: [1, 2], closes: [1, 2] })));
		vi.stubGlobal('fetch', fetchMock);
		await getHistory('AMD', '1y', 'stock');
		await getHistory('AMD', '1y', 'stock', true);
		expect(chartCalls(fetchMock)).toBe(2);
	});

	it('attaches OHLCV onto points when the arrays are present', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(historyResponse({
			timestamps: [100, 200],
			closes: [10, 11],
			opens: [9, 10.5],
			highs: [10.2, 11.4],
			lows: [8.8, 10.1],
			volumes: [1000, 2000],
		}))));
		const h = await getHistory('AAPL', '1y', 'stock');
		expect(h!.points[0]).toEqual({ t: 100, price: 10, open: 9, high: 10.2, low: 8.8, volume: 1000 });
		expect(h!.points[1]).toEqual({ t: 200, price: 11, open: 10.5, high: 11.4, low: 10.1, volume: 2000 });
	});

	it('attaches OHLCV fields independently when some are null', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(historyResponse({
			timestamps: [100, 200],
			closes: [10, 11],
			opens: [null, 10.5],
			volumes: [null, 2000],
		}))));
		const h = await getHistory('MSFT', '1y', 'stock');
		expect(h!.points[0]).toEqual({ t: 100, price: 10 });
		expect(h!.points[1]).toEqual({ t: 200, price: 11, open: 10.5, volume: 2000 });
	});

	it('captures the 52-week range onto HistoryData', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(historyResponse({
			timestamps: [1, 2],
			closes: [1, 2],
			fiftyTwoWeekHigh: 260.1,
			fiftyTwoWeekLow: 168.2,
		}))));
		const h = await getHistory('GOOG', '1y', 'stock');
		expect(h!.week52_high).toBe(260.1);
		expect(h!.week52_low).toBe(168.2);
	});

	it('populates fundamentals onto the history view (stock)', async () => {
		vi.stubGlobal('fetch', vi.fn((url: string) => {
			if (url.includes('stock/metric')) return Promise.resolve({ ok: true, json: () => Promise.resolve(finnhubMetricResponse) });
			if (url.includes('calendar/earnings')) return Promise.resolve({ ok: true, json: () => Promise.resolve(earningsResponse) });
			return Promise.resolve(historyResponse({ timestamps: [1, 2], closes: [10, 11] }));
		}));
		const h = await getHistory('AAPL', '1y', 'stock');
		expect(h!.market_cap).toBe(542_000 * 1e6);
		expect(h!.pe_ratio).toBe(28.5);
		expect(h!.dividend_yield).toBe(0.55);
		expect(h!.next_earnings).toBe(Math.floor(Date.parse('2026-07-29T00:00:00Z') / 1000));
	});

	it('does not attach fundamentals for crypto/commodity history', async () => {
		const fetchMock = vi.fn(() => Promise.resolve(historyResponse({ timestamps: [1, 2], closes: [1, 2] })));
		vi.stubGlobal('fetch', fetchMock);
		const h = await getHistory('BTC', '1y', 'crypto');
		expect(h!.market_cap).toBeUndefined();
		expect(h!.next_earnings).toBeUndefined();
		// getFundamentals short-circuits for non-stock → only the chart was fetched
		expect(fetchMock.mock.calls.every((c: unknown[]) => (c[0] as string).includes('v8/finance/chart'))).toBe(true);
	});
});

describe('getFundamentals', () => {
	it('merges metrics (incl. dividend yield) and next earnings for a stock', async () => {
		vi.stubGlobal('fetch', makeFetch(finnhubResponse, yahooResponse));
		const f = await getFundamentals('SPY');
		expect(f.market_cap).toBe(542_000 * 1e6);
		expect(f.pe_ratio).toBe(28.5);
		expect(f.dividend_yield).toBe(0.55);
		expect(f.next_earnings).toBe(Math.floor(Date.parse('2026-07-29T00:00:00Z') / 1000));
	});

	it('returns empty (no fetch) for crypto/commodity symbols', async () => {
		const fetchMock = makeFetch(finnhubResponse, yahooResponse);
		vi.stubGlobal('fetch', fetchMock);
		expect(await getFundamentals('BTC-USD')).toEqual({});
		expect(await getFundamentals('CL=F')).toEqual({});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('drops the earnings field defensively when the endpoint 403s', async () => {
		vi.stubGlobal('fetch', makeFetch(finnhubResponse, yahooResponse, finnhubMetricResponse, null));
		const f = await getFundamentals('SPY');
		expect(f.market_cap).toBe(542_000 * 1e6);
		expect(f.next_earnings).toBeUndefined();
	});
});
