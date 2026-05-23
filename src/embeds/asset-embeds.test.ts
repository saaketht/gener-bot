import { describe, it, expect } from 'vitest';
import { getAssetEmbed } from './asset-embeds';
import { PriceData } from '../utils/priceApi';

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
