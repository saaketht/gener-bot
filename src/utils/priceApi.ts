import logger from './logger';

export interface PriceData {
	symbol: string;
	query_symbol?: string;
	price: number;
	change_pct: number;
	high: number;
	low: number;
	prev_close: number;
	week52_high?: number;
	week52_low?: number;
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
	// v7/finance/quote is dead for unauthenticated clients (returns 401).
	// v8/finance/chart still works without auth and exposes price data in meta.
	try {
		const res = await fetch(
			`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=1d&range=1d`,
			{ headers: { 'User-Agent': 'Mozilla/5.0' } },
		);
		if (!res.ok) {
			logger.warn(`Yahoo chart ${symbol} returned ${res.status}`);
			return null;
		}
		const data = await res.json();
		const meta = data?.chart?.result?.[0]?.meta;
		const price = meta?.regularMarketPrice;
		const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
		if (!price || !prevClose) return null;
		const result: PriceData = {
			symbol: symbol.toUpperCase(),
			price,
			change_pct: ((price - prevClose) / prevClose) * 100,
			high: meta.regularMarketDayHigh ?? 0,
			low: meta.regularMarketDayLow ?? 0,
			prev_close: prevClose,
			source: 'yahoo',
		};
		if (meta.fiftyTwoWeekHigh) result.week52_high = meta.fiftyTwoWeekHigh;
		if (meta.fiftyTwoWeekLow) result.week52_low = meta.fiftyTwoWeekLow;
		return result;
	}
	catch (e) {
		logger.warn(`Yahoo Finance price fetch failed for ${symbol}:`, e);
		return null;
	}
}

export async function getPrice(symbol: string): Promise<PriceData | null> {
	return await fetchFinnhub(symbol) ?? await fetchYahoo(symbol);
}

export type AssetType = 'stock' | 'crypto' | 'commodity';

const VALID_TYPES = new Set<string>(['stock', 'crypto', 'commodity']);

export function toAssetType(raw: string): AssetType {
	if (VALID_TYPES.has(raw)) return raw as AssetType;
	return 'stock';
}

const COMMODITY_SYMBOLS: Record<string, string> = {
	WTI: 'CL=F',
	CRUDE: 'CL=F',
	OIL: 'CL=F',
	BRENT: 'BZ=F',
	NATURAL_GAS: 'NG=F',
	NG: 'NG=F',
	GAS: 'NG=F',
	GOLD: 'GC=F',
	SILVER: 'SI=F',
	COPPER: 'HG=F',
};

export function normalizeSymbol(symbol: string, type: AssetType): string {
	const up = symbol.toUpperCase();
	if (type === 'crypto') return up.endsWith('-USD') ? up : `${up}-USD`;
	if (type === 'commodity') return COMMODITY_SYMBOLS[up] ?? up;
	return up;
}

export async function getAssetPrice(symbol: string, type: AssetType): Promise<PriceData | null> {
	const normalized = normalizeSymbol(symbol, type);
	const data = await getPrice(normalized);
	if (!data) return null;
	// Stamp the original symbol for display ("BTC") and keep the normalized one for URLs ("BTC-USD").
	return { ...data, symbol: symbol.toUpperCase(), query_symbol: normalized };
}
