import { describe, it, expect } from 'vitest';
import type { Message } from 'discord.js';
import { quoteExcerpt, embedsToText, isFinancialEmbed } from './replyExcerpt';

// Minimal structural stand-in for a discord.js Embed — only the slots embedsToText reads.
type FakeEmbed = {
	author?: { name: string } | null;
	title?: string | null;
	description?: string | null;
	fields?: { name: string; value: string }[];
	footer?: { text: string } | null;
};

const msg = (embeds: FakeEmbed[]): Pick<Message, 'embeds'> =>
	({ embeds: embeds.map(e => ({ fields: [], ...e })) } as unknown as Pick<Message, 'embeds'>);

describe('quoteExcerpt', () => {
	it('strips the <msg> wrapper and collapses whitespace', () => {
		expect(quoteExcerpt('<msg from="gener">why   is\nit down?</msg>')).toBe('why is it down?');
	});

	it('truncates past maxLen with an ellipsis', () => {
		expect(quoteExcerpt('x'.repeat(50), 10)).toBe('xxxxxxxxxx…');
	});
});

describe('embedsToText', () => {
	it('joins title and description of a price card', () => {
		const out = embedsToText(msg([{
			title: 'State Street SPDR S&P 500 ETF Trust (SPY)  ▼ $746.20',
			description: '🔴 $2.08 (-0.28%) pre-market',
			footer: { text: 'stock  •  yahoo' },
		}]));
		expect(out).toBe('State Street SPDR S&P 500 ETF Trust (SPY)  ▼ $746.20 — 🔴 $2.08 (-0.28%) pre-market — stock  •  yahoo');
	});

	it('falls back to the footer for an image-only card (watchlist)', () => {
		expect(embedsToText(msg([{ footer: { text: 'guild watchlist  •  8 tickers  •  1D  •  yahoo' } }])))
			.toBe('guild watchlist  •  8 tickers  •  1D  •  yahoo');
	});

	it('includes author name and skips empty slots without stray separators', () => {
		expect(embedsToText(msg([{ author: { name: 'realDonaldTrump' }, description: 'covfefe' }])))
			.toBe('realDonaldTrump — covfefe');
	});

	it('merges multiple embeds with a semicolon', () => {
		const out = embedsToText(msg([
			{ title: 'SPY', description: '$746' },
			{ title: 'BTC', description: '$60k' },
		]));
		expect(out).toBe('SPY — $746; BTC — $60k');
	});

	it('flattens field name/value pairs and strips ANSI color codes', () => {
		const out = embedsToText(msg([{
			title: '📈 SPY 0DTE — 7/21',
			fields: [{ name: 'TRADES', value: '[0;32m+$420[0m win' }],
		}]));
		expect(out).toBe('📈 SPY 0DTE — 7/21 — TRADES — +$420 win');
	});

	it('returns empty string when there are no embeds', () => {
		expect(embedsToText(msg([]))).toBe('');
	});
});

describe('isFinancialEmbed', () => {
	it('matches an asset price card footer (stock/yahoo)', () => {
		expect(isFinancialEmbed(msg([{ footer: { text: 'stock  •  yahoo' } }]))).toBe(true);
	});

	it('matches a commodity card whose keyword is not in the finance regex', () => {
		expect(isFinancialEmbed(msg([{ footer: { text: 'commodity  •  1M  •  yahoo' } }]))).toBe(true);
	});

	it('matches a finnhub-sourced card', () => {
		expect(isFinancialEmbed(msg([{ footer: { text: 'stock  •  finnhub' } }]))).toBe(true);
	});

	it('matches the image-only watchlist card by "tickers … yahoo"', () => {
		expect(isFinancialEmbed(msg([{ footer: { text: 'guild watchlist  •  8 tickers  •  1D  •  yahoo' } }]))).toBe(true);
	});

	it('does not match a weather card', () => {
		expect(isFinancialEmbed(msg([{
			title: '🌤  Jacksonville — 87°F',
			footer: { text: 'Observed 09:23 • wttr.in' },
		}]))).toBe(false);
	});

	it('does not match a footerless embed', () => {
		expect(isFinancialEmbed(msg([{ title: 'SPY', description: '$746' }]))).toBe(false);
	});
});
