import logger from './logger';

export type Session = 'pre' | 'regular' | 'post' | 'closed';

export interface IntradaySeries {
	timestamps: number[];
	closes: (number | null)[];
	regular_start: number;
	regular_end: number;
}

export interface PriceData {
	symbol: string;
	query_symbol?: string;
	name?: string;
	price: number;
	change_pct: number;
	high: number;
	low: number;
	open?: number;
	volume?: number;
	prev_close: number;
	week52_high?: number;
	week52_low?: number;
	pre_market_price?: number;
	post_market_price?: number;
	regular_close?: number;
	session?: Session;
	intraday?: IntradaySeries;
	market_cap?: number;
	pe_ratio?: number;
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

function deriveSession(meta: any, nowSec: number): Session {
	const tp = meta?.currentTradingPeriod;
	if (!tp) return 'regular';
	const pre = tp.pre, reg = tp.regular, post = tp.post;
	if (pre && nowSec >= pre.start && nowSec < pre.end) return 'pre';
	if (reg && nowSec >= reg.start && nowSec < reg.end) return 'regular';
	if (post && nowSec >= post.start && nowSec < post.end) return 'post';
	return 'closed';
}

async function fetchYahoo(symbol: string): Promise<PriceData | null> {
	try {
		const res = await fetch(
			`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=5m&range=1d&includePrePost=true`,
			{ headers: { 'User-Agent': 'Mozilla/5.0' } },
		);
		if (!res.ok) {
			logger.warn(`Yahoo chart ${symbol} returned ${res.status}`);
			return null;
		}
		const data = await res.json();
		const result = data?.chart?.result?.[0];
		const meta = result?.meta;
		const regular = meta?.regularMarketPrice;
		const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
		if (!regular || !prevClose) return null;

		const pre = meta.preMarketPrice && meta.preMarketPrice > 0 ? meta.preMarketPrice : undefined;
		const post = meta.postMarketPrice && meta.postMarketPrice > 0 ? meta.postMarketPrice : undefined;

		const nowSec = Math.floor(Date.now() / 1000);
		const session = deriveSession(meta, nowSec);

		// Headline price: prefer the active extended-hours print, otherwise regular.
		let price = regular;
		if (session === 'post' && post) price = post;
		else if (session === 'pre' && pre) price = pre;
		else if (session === 'closed' && post) price = post;

		const out: PriceData = {
			symbol: symbol.toUpperCase(),
			price,
			change_pct: ((price - prevClose) / prevClose) * 100,
			high: meta.regularMarketDayHigh ?? 0,
			low: meta.regularMarketDayLow ?? 0,
			prev_close: prevClose,
			regular_close: regular,
			source: 'yahoo',
			session,
		};

		const displayName = meta.longName ?? meta.shortName;
		if (displayName) out.name = displayName;
		if (meta.regularMarketVolume) out.volume = meta.regularMarketVolume;
		if (meta.fiftyTwoWeekHigh) out.week52_high = meta.fiftyTwoWeekHigh;
		if (meta.fiftyTwoWeekLow) out.week52_low = meta.fiftyTwoWeekLow;
		if (pre) out.pre_market_price = pre;
		if (post) out.post_market_price = post;

		const timestamps: number[] | undefined = result?.timestamp;
		const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
		const reg = meta?.currentTradingPeriod?.regular;
		if (timestamps && closes && timestamps.length === closes.length && reg) {
			out.intraday = {
				timestamps,
				closes,
				regular_start: reg.start,
				regular_end: reg.end,
			};
		}

		// Yahoo's chart endpoint doesn't expose regularMarketOpen on the meta object
		// (it lives on the v7 quote endpoint, which 401s without auth). Derive it
		// from the first regular-session intraday bar.
		if (meta.regularMarketOpen) {
			out.open = meta.regularMarketOpen;
		}
		else if (out.intraday) {
			const idx = out.intraday.timestamps.findIndex(t => t >= out.intraday!.regular_start);
			const firstClose = idx >= 0 ? out.intraday.closes[idx] : null;
			if (firstClose != null) out.open = firstClose;
		}

		return out;
	}
	catch (e) {
		logger.warn(`Yahoo Finance price fetch failed for ${symbol}:`, e);
		return null;
	}
}

interface Fundamentals {
	market_cap?: number;
	pe_ratio?: number;
}

async function fetchFinnhubMetrics(symbol: string): Promise<Fundamentals | null> {
	const key = process.env.FINNHUB_API_KEY;
	if (!key) return null;

	try {
		const res = await fetch(
			`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol.toUpperCase())}&metric=all&token=${key}`,
		);
		if (!res.ok) return null;
		const data = await res.json();
		const m = data?.metric;
		if (!m) return null;
		const out: Fundamentals = {};
		// Finnhub reports marketCapitalization in millions of USD
		if (typeof m.marketCapitalization === 'number' && m.marketCapitalization > 0) {
			out.market_cap = m.marketCapitalization * 1e6;
		}
		const pe = m.peBasicExclExtraTTM ?? m.peTTM ?? m.peNormalizedAnnual;
		if (typeof pe === 'number' && isFinite(pe)) out.pe_ratio = pe;
		return out;
	}
	catch (e) {
		logger.warn(`Finnhub metric fetch failed for ${symbol}:`, e);
		return null;
	}
}

function looksLikeStock(symbol: string): boolean {
	const up = symbol.toUpperCase();
	if (up.endsWith('-USD')) return false;
	if (up.endsWith('=F')) return false;
	return true;
}

export async function getPrice(symbol: string): Promise<PriceData | null> {
	const [yahoo, fundamentals] = await Promise.all([
		fetchYahoo(symbol),
		looksLikeStock(symbol) ? fetchFinnhubMetrics(symbol) : Promise.resolve(null),
	]);
	const result = yahoo ?? await fetchFinnhub(symbol);
	if (!result) return null;
	if (fundamentals?.market_cap) result.market_cap = fundamentals.market_cap;
	if (fundamentals?.pe_ratio) result.pe_ratio = fundamentals.pe_ratio;
	return result;
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
	return { ...data, symbol: symbol.toUpperCase(), query_symbol: normalized };
}
