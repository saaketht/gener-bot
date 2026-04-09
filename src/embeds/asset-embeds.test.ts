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

describe('getAssetEmbed — stock', () => {
	it('renders symbol and price in title for up day', () => {
		const json = getAssetEmbed(stockUp, 'stock').toJSON();
		expect(json.title).toContain('SPY');
		expect(json.title).toContain('🟢');
		expect(json.title).toContain('593.25');
	});

	it('uses red indicator and color on a down day', () => {
		const json = getAssetEmbed(stockDown, 'stock').toJSON();
		expect(json.title).toContain('🔴');
		expect(json.color).toBe(0xEF4444);
	});

	it('uses green color for positive change', () => {
		expect(getAssetEmbed(stockUp, 'stock').toJSON().color).toBe(0x10B981);
	});

	it('includes Prev Close, High, Low fields', () => {
		const fields = getAssetEmbed(stockUp, 'stock').toJSON().fields!;
		const names = fields.map(f => f.name);
		expect(names).toContain('Prev Close');
		expect(names).toContain('High');
		expect(names).toContain('Low');
	});

	it('includes price bar field when range > 0', () => {
		const fields = getAssetEmbed(stockUp, 'stock').toJSON().fields!;
		const bar = fields.find(f => f.name.includes('→'));
		expect(bar?.value).toContain('░');
		expect(bar?.value).toContain('█');
	});

	it('uses display name when provided', () => {
		const json = getAssetEmbed(stockUp, 'stock', 'S&P 500 ETF').toJSON();
		expect(json.title).toContain('S&P 500 ETF');
		expect(json.title).toContain('(SPY)');
	});
});

describe('getAssetEmbed — crypto', () => {
	it('uses bitcoin orange for crypto', () => {
		expect(getAssetEmbed(cryptoData, 'crypto').toJSON().color).toBe(0xF7931A);
	});

	it('formats sub-dollar prices with 4 decimals', () => {
		const json = getAssetEmbed(subDollarCrypto, 'crypto').toJSON();
		expect(json.title).toContain('0.1234');
	});

	it('shows the symbol in the title', () => {
		const json = getAssetEmbed(cryptoData, 'crypto').toJSON();
		expect(json.title).toContain('BTC');
	});

	it('footer mentions type and source', () => {
		const footer = getAssetEmbed(cryptoData, 'crypto').toJSON().footer!.text;
		expect(footer).toContain('crypto');
		expect(footer).toContain('yahoo');
	});
});

describe('getAssetEmbed — commodity', () => {
	it('uses slate color for commodity', () => {
		expect(getAssetEmbed(commodityData, 'commodity').toJSON().color).toBe(0x1E3A5F);
	});

	it('shows price and change in title/description', () => {
		const embed = getAssetEmbed(commodityData, 'commodity').toJSON();
		expect(embed.title).toContain('68.50');
		expect(embed.description).toContain('prev close');
	});
});

describe('getAssetEmbed — 52-week data', () => {
	it('includes 52wk Low, 52wk High fields and bar when data present', () => {
		const fields = getAssetEmbed(stockUp, 'stock').toJSON().fields!;
		const names = fields.map(f => f.name);
		expect(names).toContain('52wk Low');
		expect(names).toContain('52wk High');
		const bar52 = fields.find(f => f.name.includes('52wk') && f.name.includes('→'));
		expect(bar52?.value).toContain('░');
		expect(bar52?.value).toContain('█');
	});

	it('omits 52wk fields when data is absent', () => {
		const noWeek52: PriceData = { ...stockUp, week52_high: undefined, week52_low: undefined };
		const fields = getAssetEmbed(noWeek52, 'stock').toJSON().fields!;
		const names = fields.map(f => f.name);
		expect(names).not.toContain('52wk Low');
		expect(names).not.toContain('52wk High');
	});

	it('shows 52wk values in the fields', () => {
		const fields = getAssetEmbed(stockUp, 'stock').toJSON().fields!;
		const low = fields.find(f => f.name === '52wk Low');
		const high = fields.find(f => f.name === '52wk High');
		expect(low?.value).toContain('490.68');
		expect(high?.value).toContain('613.23');
	});
});
