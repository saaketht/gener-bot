import { describe, it, expect } from 'vitest';
import { getPrice } from './priceApi';

// Run with: RUN_INTEGRATION=1 npx vitest run src/utils/priceApi.integration.test.ts
// Hits live Yahoo Finance; intentionally skipped on CI so we don't rate-limit
// ourselves or fail builds on network flakes. Run manually when you want to
// confirm the Yahoo response shape we depend on hasn't drifted.
const RUN = process.env.RUN_INTEGRATION === '1';

describe.skipIf(!RUN)('priceApi integration (live Yahoo)', () => {
	it('returns full PriceData for SPY including intraday and session', async () => {
		const data = await getPrice('SPY');
		expect(data).not.toBeNull();
		expect(data!.price).toBeGreaterThan(0);
		expect(data!.prev_close).toBeGreaterThan(0);
		expect(data!.name).toBeDefined();
		expect(data!.volume).toBeGreaterThan(0);
		expect(data!.open).toBeGreaterThan(0);
		expect(data!.session).toMatch(/^(pre|regular|post|closed)$/);
		expect(data!.intraday).toBeDefined();
		expect(data!.intraday!.timestamps.length).toBeGreaterThan(10);
		expect(data!.intraday!.regular_start).toBeGreaterThan(0);
		expect(data!.intraday!.regular_end).toBeGreaterThan(data!.intraday!.regular_start);
	}, 10_000);

	it('returns extended-hours price during post session', async () => {
		const data = await getPrice('AAPL');
		expect(data).not.toBeNull();
		// post_market_price may be undefined outside post session — only assert
		// the field is the right type when present.
		if (data!.post_market_price !== undefined) {
			expect(typeof data!.post_market_price).toBe('number');
			expect(data!.post_market_price).toBeGreaterThan(0);
		}
		expect(data!.regular_close).toBeGreaterThan(0);
	}, 10_000);

	it('returns crypto data without requiring stock-only fields', async () => {
		const data = await getPrice('BTC-USD');
		expect(data).not.toBeNull();
		expect(data!.price).toBeGreaterThan(0);
		// Crypto won't have a meaningful P/E or market cap from Finnhub
		// (we skip the metric fetch for it).
		expect(data!.pe_ratio).toBeUndefined();
		expect(data!.market_cap).toBeUndefined();
	}, 10_000);
});
