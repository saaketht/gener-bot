import { describe, it, expect } from 'vitest';
import { getStockQuoteEmbed, getCryptoEmbed, getCommodityEmbed } from './asset-embeds';

const mockStockQuote = {
	'01. symbol': 'SPY',
	'02. open': '590.00',
	'03. high': '595.50',
	'04. low': '588.00',
	'05. price': '593.25',
	'06. volume': '45678900',
	'07. latest trading day': '2026-03-19',
	'08. previous close': '589.00',
	'09. change': '4.25',
	'10. change percent': '0.7215%',
};

const mockStockQuoteDown = {
	...mockStockQuote,
	'05. price': '585.00',
	'09. change': '-4.00',
	'10. change percent': '-0.6791%',
};

const mockCryptoRate = {
	'1. From_Currency Code': 'BTC',
	'2. From_Currency Name': 'Bitcoin',
	'3. To_Currency Code': 'USD',
	'4. To_Currency Name': 'United States Dollar',
	'5. Exchange Rate': '87654.32',
	'6. Last Refreshed': '2026-03-19 04:00:00',
	'7. Time Zone': 'UTC',
	'8. Bid Price': '87650.00',
	'9. Ask Price': '87660.00',
};

const mockCommodityResponse = {
	name: 'Crude Oil (WTI)',
	unit: 'dollars per barrel',
	data: [
		{ date: '2026-03-19', value: '68.50' },
		{ date: '2026-03-18', value: '67.25' },
		{ date: '2026-03-17', value: '66.80' },
		{ date: '2026-03-14', value: '67.00' },
		{ date: '2026-03-13', value: '66.50' },
	],
};

describe('getStockQuoteEmbed', () => {
	it('creates embed with correct title for up day', () => {
		const embed = getStockQuoteEmbed(mockStockQuote);
		const json = embed.toJSON();
		expect(json.title).toContain('SPY');
		expect(json.title).toContain('🟢');
		expect(json.title).toContain('593.25');
	});

	it('creates embed with red indicator for down day', () => {
		const embed = getStockQuoteEmbed(mockStockQuoteDown);
		const json = embed.toJSON();
		expect(json.title).toContain('🔴');
	});

	it('sets green color for positive change', () => {
		const embed = getStockQuoteEmbed(mockStockQuote);
		expect(embed.toJSON().color).toBe(0x10B981);
	});

	it('sets red color for negative change', () => {
		const embed = getStockQuoteEmbed(mockStockQuoteDown);
		expect(embed.toJSON().color).toBe(0xEF4444);
	});

	it('includes all expected fields', () => {
		const embed = getStockQuoteEmbed(mockStockQuote);
		const fields = embed.toJSON().fields!;
		const names = fields.map(f => f.name);
		expect(names).toContain('Open');
		expect(names).toContain('Prev Close');
		expect(names).toContain('Volume');
		expect(names).toContain('High');
		expect(names).toContain('Low');
		expect(names).toContain('Range');
	});

	it('formats volume with suffix', () => {
		const embed = getStockQuoteEmbed(mockStockQuote);
		const volumeField = embed.toJSON().fields!.find(f => f.name === 'Volume');
		expect(volumeField?.value).toContain('M');
	});

	it('includes price bar', () => {
		const embed = getStockQuoteEmbed(mockStockQuote);
		const fields = embed.toJSON().fields!;
		const barField = fields.find(f => f.name.includes('→'));
		expect(barField?.value).toContain('░');
		expect(barField?.value).toContain('█');
	});
});

describe('getCryptoEmbed', () => {
	it('creates embed with crypto name and symbol', () => {
		const embed = getCryptoEmbed(mockCryptoRate);
		const json = embed.toJSON();
		expect(json.title).toContain('Bitcoin');
		expect(json.title).toContain('BTC');
	});

	it('shows price in USD', () => {
		const embed = getCryptoEmbed(mockCryptoRate);
		expect(embed.toJSON().description).toContain('USD');
	});

	it('includes bid, ask, and spread fields', () => {
		const embed = getCryptoEmbed(mockCryptoRate);
		const fields = embed.toJSON().fields!;
		const names = fields.map(f => f.name);
		expect(names).toContain('Bid');
		expect(names).toContain('Ask');
		expect(names).toContain('Spread');
	});

	it('uses bitcoin orange color', () => {
		const embed = getCryptoEmbed(mockCryptoRate);
		expect(embed.toJSON().color).toBe(0xF7931A);
	});
});

describe('getCommodityEmbed', () => {
	it('creates embed with name and price', () => {
		const embed = getCommodityEmbed('WTI', mockCommodityResponse);
		const json = embed.toJSON();
		expect(json.title).toContain('Crude Oil');
		expect(json.title).toContain('68.50');
	});

	it('shows change from previous day', () => {
		const embed = getCommodityEmbed('WTI', mockCommodityResponse);
		const desc = embed.toJSON().description!;
		expect(desc).toContain('🟢');
		expect(desc).toContain('previous day');
	});

	it('includes recent history', () => {
		const embed = getCommodityEmbed('WTI', mockCommodityResponse);
		const fields = embed.toJSON().fields!;
		expect(fields.some(f => f.name === 'Recent')).toBe(true);
	});

	it('handles empty data', () => {
		const embed = getCommodityEmbed('WTI', { name: 'Oil', unit: 'usd', data: [] });
		expect(embed.toJSON().description).toContain('No recent data');
	});

	it('filters out dots in data', () => {
		const data = {
			name: 'Gas',
			unit: 'usd',
			data: [
				{ date: '2026-03-19', value: '.' },
				{ date: '2026-03-18', value: '2.50' },
				{ date: '2026-03-17', value: '2.45' },
				{ date: '2026-03-16', value: '2.40' },
			],
		};
		const embed = getCommodityEmbed('NATURAL_GAS', data);
		expect(embed.toJSON().title).toContain('2.50');
	});
});
