import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAssetEmbed, getHistoryEmbed, buildTimeframeRows, parseTimeframeCustomId, resolveAssetView, buildWatchlistButtons, parseWatchlistCustomId } from './asset-embeds';
import { PriceData, HistoryData, clearPriceCache, clearHistoryCache } from '../utils/priceApi';

const stockUp: PriceData = {
	symbol: 'SPY',
	price: 593.25,
	change_pct: 0.7215,
	high: 595.5,
	low: 588,
	prev_close: 589,
	week52_high: 613.23,
	week52_low: 490.68,
	source: 'yahoo',
};

const stockDown: PriceData = { ...stockUp, price: 585, change_pct: -0.6791 };

const cryptoData: PriceData = {
	symbol: 'BTC',
	price: 87654.32,
	change_pct: 1.42,
	high: 88000,
	low: 86500,
	prev_close: 86430,
	source: 'yahoo',
};

const subDollarCrypto: PriceData = {
	symbol: 'DOGE',
	price: 0.1234,
	change_pct: -2.5,
	high: 0.13,
	low: 0.12,
	prev_close: 0.1265,
	source: 'yahoo',
};

const commodityData: PriceData = {
	symbol: 'WTI',
	price: 68.5,
	change_pct: 1.86,
	high: 69.0,
	low: 67.8,
	prev_close: 67.25,
	source: 'yahoo',
};

const stockUpWithIntraday: PriceData = {
	...stockUp,
	name: 'SPDR S&P 500 ETF Trust',
	regular_close: 593.25,
	session: 'regular',
	intraday: {
		timestamps: [1736179200, 1736179500, 1736179800],
		closes: [591.5, 592.4, 593.25],
		regular_start: 1736179200,
		regular_end: 1736202600,
	},
};

describe('getAssetEmbed — stock', () => {
	it('renders symbol and price in title for up day', () => {
		const json = getAssetEmbed(stockUp, 'stock').embed.toJSON();
		expect(json.title).toContain('SPY');
		expect(json.title).toContain('🟢');
		expect(json.title).toContain('593.25');
	});

	it('uses red indicator and color on a down day', () => {
		const json = getAssetEmbed(stockDown, 'stock').embed.toJSON();
		expect(json.title).toContain('🔴');
		expect(json.color).toBe(0xEF4444);
	});

	it('uses green color for positive change', () => {
		expect(getAssetEmbed(stockUp, 'stock').embed.toJSON().color).toBe(0x10B981);
	});

	it('falls back to text fields when no intraday data', () => {
		const fields = getAssetEmbed(stockUp, 'stock').embed.toJSON().fields!;
		const names = fields.map(f => f.name);
		expect(names).toContain('Prev Close');
		expect(names).toContain('High');
		expect(names).toContain('Low');
	});

	it('includes ASCII price bar in fallback when range > 0', () => {
		const fields = getAssetEmbed(stockUp, 'stock').embed.toJSON().fields!;
		const bar = fields.find(f => f.name.includes('→'));
		expect(bar?.value).toContain('░');
		expect(bar?.value).toContain('█');
	});

	it('uses display name when provided', () => {
		const json = getAssetEmbed(stockUp, 'stock', 'S&P 500 ETF').embed.toJSON();
		expect(json.title).toContain('S&P 500 ETF');
		expect(json.title).toContain('(SPY)');
	});

	it('uses PriceData.name when no displayName arg given', () => {
		const json = getAssetEmbed(stockUpWithIntraday, 'stock').embed.toJSON();
		expect(json.title).toContain('SPDR S&P 500 ETF Trust');
	});
});

describe('getAssetEmbed — chart attachment', () => {
	it('attaches a PNG and sets image when intraday is present', () => {
		const result = getAssetEmbed(stockUpWithIntraday, 'stock');
		expect(result.files.length).toBe(1);
		expect(result.files[0].name).toMatch(/^chart-\d+\.png$/);
		const json = result.embed.toJSON();
		expect(json.image?.url).toMatch(/^attachment:\/\/chart-\d+\.png$/);
	});

	it('omits ASCII range fields when chart is present', () => {
		const fields = getAssetEmbed(stockUpWithIntraday, 'stock').embed.toJSON().fields;
		expect(fields ?? []).toEqual([]);
	});

	it('returns no files when intraday is absent', () => {
		const result = getAssetEmbed(stockUp, 'stock');
		expect(result.files.length).toBe(0);
		expect(result.embed.toJSON().image).toBeUndefined();
	});
});

describe('getAssetEmbed — crypto', () => {
	it('uses bitcoin orange for crypto', () => {
		expect(getAssetEmbed(cryptoData, 'crypto').embed.toJSON().color).toBe(0xF7931A);
	});

	it('formats sub-dollar prices with 4 decimals', () => {
		const json = getAssetEmbed(subDollarCrypto, 'crypto').embed.toJSON();
		expect(json.title).toContain('0.1234');
	});

	it('shows the symbol in the title', () => {
		const json = getAssetEmbed(cryptoData, 'crypto').embed.toJSON();
		expect(json.title).toContain('BTC');
	});

	it('footer mentions type and source', () => {
		const footer = getAssetEmbed(cryptoData, 'crypto').embed.toJSON().footer!.text;
		expect(footer).toContain('crypto');
		expect(footer).toContain('yahoo');
	});
});

describe('getAssetEmbed — commodity', () => {
	it('uses slate color for commodity', () => {
		expect(getAssetEmbed(commodityData, 'commodity').embed.toJSON().color).toBe(0x1E3A5F);
	});

	it('shows price and change in title/description', () => {
		const embed = getAssetEmbed(commodityData, 'commodity').embed.toJSON();
		expect(embed.title).toContain('68.50');
		expect(embed.description).toContain('prev close');
	});
});

describe('getAssetEmbed — 52-week data (text fallback)', () => {
	it('includes 52wk Low, 52wk High fields and bar when data present and no chart', () => {
		const fields = getAssetEmbed(stockUp, 'stock').embed.toJSON().fields!;
		const names = fields.map(f => f.name);
		expect(names).toContain('52wk Low');
		expect(names).toContain('52wk High');
		const bar52 = fields.find(f => f.name.includes('52wk') && f.name.includes('→'));
		expect(bar52?.value).toContain('░');
		expect(bar52?.value).toContain('█');
	});

	it('omits 52wk fields when data is absent', () => {
		const noWeek52: PriceData = { ...stockUp, week52_high: undefined, week52_low: undefined };
		const fields = getAssetEmbed(noWeek52, 'stock').embed.toJSON().fields!;
		const names = fields.map(f => f.name);
		expect(names).not.toContain('52wk Low');
		expect(names).not.toContain('52wk High');
	});

	it('shows 52wk values in the fields', () => {
		const fields = getAssetEmbed(stockUp, 'stock').embed.toJSON().fields!;
		const low = fields.find(f => f.name === '52wk Low');
		const high = fields.find(f => f.name === '52wk High');
		expect(low?.value).toContain('490.68');
		expect(high?.value).toContain('613.23');
	});
});

const historyUp: HistoryData = {
	symbol: 'QQQM',
	query_symbol: 'QQQM',
	name: 'Invesco NASDAQ 100 ETF',
	range: '1y',
	source: 'yahoo',
	points: [
		{ t: 100, price: 220 },
		{ t: 200, price: 250 },
		{ t: 300, price: 305 },
	],
};

describe('getHistoryEmbed', () => {
	it('measures change from the first point of the window, not prev close', () => {
		const json = getHistoryEmbed(historyUp, 'stock').embed.toJSON();
		// (305 - 220) / 220 = 38.64%
		expect(json.description).toContain('38.64%');
		expect(json.description).toContain('over 1Y');
		expect(json.title).toContain('🟢');
		expect(json.title).toContain('305');
	});

	it('renders red and negative for a down window', () => {
		const down: HistoryData = { ...historyUp, points: [{ t: 1, price: 300 }, { t: 2, price: 240 }] };
		const json = getHistoryEmbed(down, 'stock').embed.toJSON();
		expect(json.title).toContain('🔴');
		expect(json.color).toBe(0xEF4444);
		expect(json.description).toContain('-20.00%');
	});

	it('attaches a chart PNG and points the embed image at it', () => {
		const result = getHistoryEmbed(historyUp, 'stock');
		expect(result.files.length).toBe(1);
		expect(result.embed.toJSON().image?.url).toMatch(/^attachment:\/\/chart-\d+\.png$/);
	});

	it('footer carries the timeframe label, type and source', () => {
		const footer = getHistoryEmbed(historyUp, 'stock').embed.toJSON().footer!.text;
		expect(footer).toContain('1Y');
		expect(footer).toContain('stock');
		expect(footer).toContain('yahoo');
	});

	it('uses the display name when provided', () => {
		const json = getHistoryEmbed(historyUp, 'stock', 'QQQM Fund').embed.toJSON();
		expect(json.title).toContain('QQQM Fund');
		expect(json.title).toContain('(QQQM)');
	});
});

describe('timeframe buttons', () => {
	it('builds 8 timeframe buttons + refresh + toggle across 2 rows of 5', () => {
		const rows = buildTimeframeRows('AAPL', 'stock', '1d');
		expect(rows.length).toBe(2);
		const buttons = rows.flatMap(r => r.toJSON().components);
		expect(buttons.length).toBe(10);
		expect(rows[0].toJSON().components.length).toBe(5);
		expect(rows[1].toJSON().components.length).toBe(5);
	});

	it('disables and highlights the active timeframe only', () => {
		const buttons = buildTimeframeRows('AAPL', 'stock', '1y').flatMap(r => r.toJSON().components) as any[];
		const tf = buttons.filter(b => b.custom_id?.startsWith('asset_tf_'));
		const active = tf.filter(b => b.disabled);
		expect(active.length).toBe(1);
		expect(active[0].custom_id).toBe('asset_tf_line_1y_stock_AAPL');
		// style 1 === ButtonStyle.Primary
		expect(active[0].style).toBe(1);
	});

	it('emits a refresh button encoding the active range + mode, never disabled', () => {
		const buttons = buildTimeframeRows('AAPL', 'stock', '3m', 'candle').flatMap(r => r.toJSON().components) as any[];
		const refresh = buttons.find(b => b.custom_id?.startsWith('asset_refresh_'));
		expect(refresh.custom_id).toBe('asset_refresh_candle_3m_stock_AAPL');
		expect(refresh.disabled).toBeFalsy();
	});

	it('emits a toggle that targets the opposite mode and is enabled on candle-capable ranges', () => {
		const buttons = buildTimeframeRows('AAPL', 'stock', '3m', 'line').flatMap(r => r.toJSON().components) as any[];
		const toggle = buttons.find(b => b.custom_id?.startsWith('asset_mode_'));
		expect(toggle.custom_id).toBe('asset_mode_candle_3m_stock_AAPL');
		expect(toggle.emoji?.name).toBe('🕯️');
		expect(toggle.disabled).toBeFalsy();
	});

	it('disables the toggle on ranges too dense for candles', () => {
		for (const range of ['1y', '5y', 'all']) {
			const toggle = (buildTimeframeRows('AAPL', 'stock', range).flatMap(r => r.toJSON().components) as any[])
				.find(b => b.custom_id?.startsWith('asset_mode_'));
			expect(toggle.disabled).toBe(true);
		}
	});

	it('round-trips encode → parse for every type, preserving mode', () => {
		for (const [sym, type] of [['AAPL', 'stock'], ['BTC', 'crypto'], ['WTI', 'commodity']] as const) {
			const id = buildTimeframeRows(sym, type, '1d', 'candle').flatMap(r => r.toJSON().components)
				.map((b: any) => b.custom_id).find((c: string) => c.startsWith('asset_tf_') && c.includes('_3m_'))!;
			expect(parseTimeframeCustomId(id)).toEqual({ mode: 'candle', range: '3m', type, symbol: sym });
		}
	});

	it('parses the refresh and mode-toggle prefixes', () => {
		expect(parseTimeframeCustomId('asset_refresh_line_1y_crypto_BTC')).toEqual({ mode: 'line', range: '1y', type: 'crypto', symbol: 'BTC' });
		expect(parseTimeframeCustomId('asset_mode_candle_3m_stock_AAPL')).toEqual({ mode: 'candle', range: '3m', type: 'stock', symbol: 'AAPL' });
	});

	it('defaults legacy 4-segment customIds (no mode) to line', () => {
		expect(parseTimeframeCustomId('asset_tf_1y_crypto_BTC')).toEqual({ mode: 'line', range: '1y', type: 'crypto', symbol: 'BTC' });
	});

	it('parses a symbol that itself contains underscores', () => {
		expect(parseTimeframeCustomId('asset_mode_candle_5y_commodity_NATURAL_GAS')).toEqual({
			mode: 'candle', range: '5y', type: 'commodity', symbol: 'NATURAL_GAS',
		});
	});

	it('coerces an unknown type token to stock', () => {
		expect(parseTimeframeCustomId('asset_tf_1m_etf_SPY')?.type).toBe('stock');
	});

	it('returns null for non-timeframe or malformed customIds', () => {
		expect(parseTimeframeCustomId('flight_refresh_12')).toBeNull();
		expect(parseTimeframeCustomId('asset_tf_1y')).toBeNull();
		expect(parseTimeframeCustomId('asset_tf_line_1y_stock_')).toBeNull();
	});
});

// A Yahoo chart response that satisfies both the live-quote path (meta price +
// prev close) and the history path (timestamp + close arrays).
function chartResponse() {
	return {
		ok: true,
		json: () => Promise.resolve({
			chart: { result: [{
				meta: {
					regularMarketPrice: 100,
					chartPreviousClose: 95,
					regularMarketDayHigh: 101,
					regularMarketDayLow: 99,
					longName: 'Test Co',
				},
				timestamp: [100, 200, 300],
				indicators: { quote: [{ close: [96, 98, 100] }] },
			}] },
		}),
	};
}

function yahooChartCalls(mock: ReturnType<typeof vi.fn>): number {
	return mock.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('v8/finance/chart')).length;
}

describe('resolveAssetView', () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		clearPriceCache();
		clearHistoryCache();
		// No Finnhub key → live path uses Yahoo only, so every fetch is a chart call.
		delete process.env.FINNHUB_API_KEY;
	});

	it('routes 1d to the live quote (footer carries source, not a range label)', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(chartResponse())));
		const result = await resolveAssetView('SPY', 'stock', '1d');
		expect(result).not.toBeNull();
		const json = result!.embed.toJSON();
		expect(json.title).toContain('SPY');
		expect(json.footer!.text).toContain('yahoo');
		expect(json.footer!.text).not.toContain('1D');
	});

	it('routes non-1d ranges to history (footer + description carry the range)', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(chartResponse())));
		const result = await resolveAssetView('SPY', 'stock', '1y');
		expect(result).not.toBeNull();
		const json = result!.embed.toJSON();
		expect(json.footer!.text).toContain('1Y');
		expect(json.description).toContain('over 1Y');
	});

	it('returns null when the fetch yields nothing', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
		expect(await resolveAssetView('NOPE', 'stock', '1y')).toBeNull();
		expect(await resolveAssetView('NOPE', 'stock', '1d')).toBeNull();
	});

	it('propagates force to bypass the cache on refresh', async () => {
		const fetchMock = vi.fn(() => Promise.resolve(chartResponse()));
		vi.stubGlobal('fetch', fetchMock);
		await resolveAssetView('SPY', 'stock', '1y');
		const afterFirst = yahooChartCalls(fetchMock);
		// Second call is served from cache — no new fetch
		await resolveAssetView('SPY', 'stock', '1y');
		expect(yahooChartCalls(fetchMock)).toBe(afterFirst);
		// force=true refetches
		await resolveAssetView('SPY', 'stock', '1y', true);
		expect(yahooChartCalls(fetchMock)).toBeGreaterThan(afterFirst);
	});
});

describe('watchlist buttons', () => {
	it('builds 8 timeframes + refresh + view-toggle across 2 rows of 5', () => {
		const rows = buildWatchlistButtons('1d');
		expect(rows.length).toBe(2);
		const buttons = rows.flatMap(r => r.toJSON().components);
		expect(buttons.length).toBe(10);
		expect(rows[1].toJSON().components.length).toBe(5);
	});

	it('encodes the active view in timeframe + refresh customIds', () => {
		const buttons = buildWatchlistButtons('3m', 'overlay').flatMap(r => r.toJSON().components) as any[];
		const active = buttons.filter(b => b.custom_id?.startsWith('watchlist_tf_') && b.disabled);
		expect(active[0].custom_id).toBe('watchlist_tf_overlay_3m');
		const refresh = buttons.find(b => b.custom_id?.startsWith('watchlist_refresh_'));
		expect(refresh.custom_id).toBe('watchlist_refresh_overlay_3m');
	});

	it('view toggle targets the opposite view with the matching emoji', () => {
		const rowsView = (buildWatchlistButtons('1y', 'rows').flatMap(r => r.toJSON().components) as any[])
			.find(b => b.custom_id?.startsWith('watchlist_view_'));
		expect(rowsView.custom_id).toBe('watchlist_view_overlay_1y');
		expect(rowsView.emoji?.name).toBe('📈');
		const overlayView = (buildWatchlistButtons('1y', 'overlay').flatMap(r => r.toJSON().components) as any[])
			.find(b => b.custom_id?.startsWith('watchlist_view_'));
		expect(overlayView.custom_id).toBe('watchlist_view_rows_1y');
		expect(overlayView.emoji?.name).toBe('📋');
	});

	it('round-trips encode → parse for tf, refresh and view', () => {
		const enc = (pred: (c: string) => boolean) =>
			(buildWatchlistButtons('3m', 'overlay').flatMap(r => r.toJSON().components) as any[])
				.map(b => b.custom_id).find(pred)!;
		expect(parseWatchlistCustomId(enc(c => c.startsWith('watchlist_tf_') && c.endsWith('_1y'))))
			.toEqual({ view: 'overlay', range: '1y', force: false });
		expect(parseWatchlistCustomId(enc(c => c.startsWith('watchlist_refresh_'))))
			.toEqual({ view: 'overlay', range: '3m', force: true });
		expect(parseWatchlistCustomId('watchlist_refresh_rows_1w')).toEqual({ view: 'rows', range: '1w', force: true });
		expect(parseWatchlistCustomId('watchlist_view_overlay_ytd')).toEqual({ view: 'overlay', range: 'ytd', force: false });
	});

	it('returns null for non-watchlist or malformed customIds', () => {
		expect(parseWatchlistCustomId('asset_tf_line_1y_stock_AAPL')).toBeNull();
		expect(parseWatchlistCustomId('watchlist_tf_rows')).toBeNull();
		expect(parseWatchlistCustomId('watchlist_view_rows_')).toBeNull();
	});
});
