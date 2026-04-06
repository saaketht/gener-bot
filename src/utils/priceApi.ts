import logger from './logger';

export interface PriceData {
	symbol: string;
	price: number;
	change_pct: number;
	high: number;
	low: number;
	prev_close: number;
	source: string;
}

async function fetchFinnhub(symbol: string): Promise<PriceData | null> {
	const key = process.env.FINNHUB_API_KEY;
	if (!key) return null;

	try {
		const res = await fetch(
			`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol.toUpperCase())}&token=${key}`,
		);
		if (!res.ok) return null;
		const data = await res.json();
		// c === 0 means symbol not found or market closed with no data
		if (!data.c || data.c === 0) return null;
		return {
			symbol: symbol.toUpperCase(),
			price: data.c,
			change_pct: data.pc ? ((data.c - data.pc) / data.pc) * 100 : 0,
			high: data.h,
			low: data.l,
			prev_close: data.pc,
			source: 'finnhub',
		};
	}
	catch (e) {
		logger.warn(`Finnhub price fetch failed for ${symbol}:`, e);
		return null;
	}
}

async function fetchYahoo(symbol: string): Promise<PriceData | null> {
	try {
		const res = await fetch(
			`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol.toUpperCase())}`,
			{ headers: { 'User-Agent': 'Mozilla/5.0' } },
		);
		if (!res.ok) return null;
		const data = await res.json();
		const quote = data?.quoteResponse?.result?.[0];
		if (!quote?.regularMarketPrice) return null;
		return {
			symbol: symbol.toUpperCase(),
			price: quote.regularMarketPrice,
			change_pct: quote.regularMarketChangePercent ?? 0,
			high: quote.regularMarketDayHigh ?? 0,
			low: quote.regularMarketDayLow ?? 0,
			prev_close: quote.regularMarketPreviousClose ?? 0,
			source: 'yahoo',
		};
	}
	catch (e) {
		logger.warn(`Yahoo Finance price fetch failed for ${symbol}:`, e);
		return null;
	}
}

export async function getPrice(symbol: string): Promise<PriceData | null> {
	return await fetchFinnhub(symbol) ?? await fetchYahoo(symbol);
}
