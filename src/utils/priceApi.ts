import logger from './logger';

export type Session = 'pre' | 'regular' | 'post' | 'closed';

export interface IntradaySeries {
	timestamps: number[];
	closes: (number | null)[];
	volumes?: (number | null)[];
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
	dividend_yield?: number;
	next_earnings?: number;
	source: string;
}

export interface HistoryPoint {
	t: number;
	price: number;
	open?: number;
	high?: number;
	low?: number;
	volume?: number;
}

export interface HistoryData {
	symbol: string;
	query_symbol?: string;
	name?: string;
	range: string;
	points: HistoryPoint[];
	week52_high?: number;
	week52_low?: number;
	market_cap?: number;
	pe_ratio?: number;
	dividend_yield?: number;
	next_earnings?: number;
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

// Latest non-null close inside [start, end). Used to recover extended-hours
// prints from the intraday series, since Yahoo's chart meta omits them.
function lastCloseInWindow(
	timestamps: number[],
	closes: (number | null)[],
	start?: number,
	end?: number,
): number | undefined {
	if (start == null || end == null) return undefined;
	let val: number | undefined;
	for (let i = 0; i < timestamps.length; i++) {
		const c = closes[i];
		if (c != null && c > 0 && timestamps[i] >= start && timestamps[i] < end) val = c;
	}
	return val;
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
		if (!regular || !prevClose) {
			logger.warn(`Yahoo chart ${symbol} missing required fields (regularMarketPrice=${regular}, prevClose=${prevClose}) — schema may have changed`);
			return null;
		}

		const timestamps: number[] | undefined = result?.timestamp;
		const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
		const volumes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.volume;
		const tp = meta?.currentTradingPeriod;
		const reg = tp?.regular;

		// Yahoo's chart meta exposes no preMarketPrice/postMarketPrice — the only
		// place extended-hours prints live is the intraday close series (it carries
		// pre/post bars because of includePrePost=true). Recover the latest print in
		// each window. Bounding by the actual pre/post windows means stale data
		// (e.g. last Friday's bars while currentTradingPeriod already points at
		// Monday) isn't misattributed as a live extended-hours quote.
		const pre = (timestamps && closes)
			? lastCloseInWindow(timestamps, closes, tp?.pre?.start, reg?.start)
			: undefined;
		const post = (timestamps && closes)
			? lastCloseInWindow(timestamps, closes, reg?.end, tp?.post?.end)
			: undefined;

		const nowSec = Math.floor(Date.now() / 1000);
		const session = deriveSession(meta, nowSec);

		// Headline price + the baseline its change is measured against. During an
		// active extended session the print is measured against the last regular
		// close (Yahoo's big colored extended number); otherwise against prev close.
		const extPrice = session === 'pre' ? pre : session === 'post' ? post : undefined;
		const price = extPrice ?? regular;
		const baseline = extPrice ? regular : prevClose;

		const out: PriceData = {
			symbol: symbol.toUpperCase(),
			price,
			change_pct: baseline ? ((price - baseline) / baseline) * 100 : 0,
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

		if (timestamps && closes && timestamps.length === closes.length && reg) {
			out.intraday = {
				timestamps,
				closes,
				regular_start: reg.start,
				regular_end: reg.end,
			};
			if (volumes && volumes.length === timestamps.length) out.intraday.volumes = volumes;
		}
		else {
			logger.warn(`Yahoo chart ${symbol} returned no intraday series (timestamps=${!!timestamps}, closes=${!!closes}, currentTradingPeriod=${!!reg}) — falling back to text-only embed`);
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
	dividend_yield?: number;
	next_earnings?: number;
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
		const dy = m.currentDividendYieldTTM ?? m.dividendYieldIndicatedAnnual;
		if (typeof dy === 'number' && isFinite(dy) && dy >= 0) out.dividend_yield = dy;
		return out;
	}
	catch (e) {
		logger.warn(`Finnhub metric fetch failed for ${symbol}:`, e);
		return null;
	}
}

// Next scheduled earnings date (epoch seconds). Defensive: returns undefined on a
// non-ok response / empty calendar so a premium-gated or earnings-less symbol
// (ETF, crypto) just drops the field rather than failing the whole fetch.
async function fetchFinnhubEarnings(symbol: string): Promise<number | undefined> {
	const key = process.env.FINNHUB_API_KEY;
	if (!key) return undefined;
	try {
		const today = new Date().toISOString().slice(0, 10);
		const to = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
		const res = await fetch(
			`https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(symbol.toUpperCase())}&from=${today}&to=${to}&token=${key}`,
		);
		if (!res.ok) return undefined;
		const data = await res.json();
		const date: string | undefined = data?.earningsCalendar?.[0]?.date;
		if (!date) return undefined;
		const epoch = Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
		return isFinite(epoch) ? epoch : undefined;
	}
	catch (e) {
		logger.warn(`Finnhub earnings fetch failed for ${symbol}:`, e);
		return undefined;
	}
}

// Per-symbol fundamentals (metrics + next earnings), cached longer than prices
// since they barely move. Gated by looksLikeStock — crypto/commodities have none.
interface FundCacheEntry { data: Fundamentals; ts: number }
const fundamentalsCache = new Map<string, FundCacheEntry>();
const FUNDAMENTALS_TTL_MS = 30 * 60_000;

export async function getFundamentals(symbol: string): Promise<Fundamentals> {
	const key = symbol.toUpperCase();
	if (!looksLikeStock(key)) return {};
	const hit = fundamentalsCache.get(key);
	if (hit && Date.now() - hit.ts < FUNDAMENTALS_TTL_MS) return hit.data;

	const [metrics, earnings] = await Promise.all([fetchFinnhubMetrics(key), fetchFinnhubEarnings(key)]);
	const out: Fundamentals = { ...(metrics ?? {}) };
	if (earnings) out.next_earnings = earnings;
	fundamentalsCache.set(key, { data: out, ts: Date.now() });
	return out;
}

export function clearFundamentalsCache() {
	fundamentalsCache.clear();
}

function looksLikeStock(symbol: string): boolean {
	const up = symbol.toUpperCase();
	if (up.endsWith('-USD')) return false;
	if (up.endsWith('=F')) return false;
	return true;
}

// 30s in-memory cache of full PriceData. Bypassed during pre/post sessions
// where every print matters more — users querying AH usually care about the
// most recent tick. Tradeoff: ~5% staleness vs ~90% fewer API calls on hot
// tickers (multiple users typing $SPY within the window).
interface CacheEntry { data: PriceData; ts: number }
const priceCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 200;

function readCache(key: string): PriceData | null {
	const hit = priceCache.get(key);
	if (!hit) return null;
	if (Date.now() - hit.ts > CACHE_TTL_MS) {
		priceCache.delete(key);
		return null;
	}
	if (hit.data.session === 'pre' || hit.data.session === 'post') return null;
	return hit.data;
}

function writeCache(key: string, data: PriceData) {
	if (priceCache.size >= CACHE_MAX) {
		const oldest = priceCache.keys().next().value;
		if (oldest) priceCache.delete(oldest);
	}
	priceCache.set(key, { data, ts: Date.now() });
}

export function clearPriceCache() {
	priceCache.clear();
}

export async function getPrice(symbol: string, force = false): Promise<PriceData | null> {
	const key = symbol.toUpperCase();
	const cached = force ? null : readCache(key);
	if (cached) return cached;

	const [yahoo, fundamentals] = await Promise.all([
		fetchYahoo(symbol),
		getFundamentals(symbol),
	]);
	const result = yahoo ?? await fetchFinnhub(symbol);
	if (!result) return null;
	if (fundamentals.market_cap) result.market_cap = fundamentals.market_cap;
	if (fundamentals.pe_ratio) result.pe_ratio = fundamentals.pe_ratio;
	if (fundamentals.dividend_yield != null) result.dividend_yield = fundamentals.dividend_yield;
	if (fundamentals.next_earnings) result.next_earnings = fundamentals.next_earnings;
	writeCache(key, result);
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

export async function getAssetPrice(symbol: string, type: AssetType, force = false): Promise<PriceData | null> {
	const normalized = normalizeSymbol(symbol, type);
	const data = await getPrice(normalized, force);
	if (!data) return null;
	return { ...data, symbol: symbol.toUpperCase(), query_symbol: normalized };
}

// Yahoo range/interval pairs for the historical timeframe buttons. '1d' is
// intentionally absent — the live intraday path (getAssetPrice → renderAssetChart)
// handles it with full session/extended-hours detail.
const RANGE_INTERVAL: Record<string, { range: string; interval: string }> = {
	'1w': { range: '5d', interval: '30m' },
	'1m': { range: '1mo', interval: '1d' },
	'3m': { range: '3mo', interval: '1d' },
	'ytd': { range: 'ytd', interval: '1d' },
	'1y': { range: '1y', interval: '1d' },
	'5y': { range: '5y', interval: '1wk' },
	'all': { range: 'max', interval: '1mo' },
};

// Display labels for every timeframe (includes '1d' for the button/footer UI).
export const RANGE_LABELS: Record<string, string> = {
	'1d': '1D',
	'1w': '1W',
	'1m': '1M',
	'3m': '3M',
	'ytd': 'YTD',
	'1y': '1Y',
	'5y': '5Y',
	'all': 'ALL',
};

async function fetchYahooHistory(symbol: string, yRange: string, interval: string): Promise<HistoryData | null> {
	try {
		const res = await fetch(
			`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=${interval}&range=${yRange}`,
			{ headers: { 'User-Agent': 'Mozilla/5.0' } },
		);
		if (!res.ok) {
			logger.warn(`Yahoo history ${symbol} (${yRange}) returned ${res.status}`);
			return null;
		}
		const data = await res.json();
		const result = data?.chart?.result?.[0];
		const meta = result?.meta;
		const timestamps: number[] | undefined = result?.timestamp;
		const quote = result?.indicators?.quote?.[0];
		const closes: (number | null)[] | undefined = quote?.close;
		if (!timestamps || !closes || timestamps.length !== closes.length) {
			logger.warn(`Yahoo history ${symbol} (${yRange}) missing series`);
			return null;
		}
		const opens: (number | null)[] | undefined = quote?.open;
		const highs: (number | null)[] | undefined = quote?.high;
		const lows: (number | null)[] | undefined = quote?.low;
		const volumes: (number | null)[] | undefined = quote?.volume;

		const points: HistoryPoint[] = [];
		for (let i = 0; i < timestamps.length; i++) {
			const c = closes[i];
			if (c == null) continue;
			// Gate on close; a bar can have a present close but a null open/high on thin
			// trading, so attach each OHLCV field independently when available.
			const pt: HistoryPoint = { t: timestamps[i], price: c };
			if (opens?.[i] != null) pt.open = opens[i] as number;
			if (highs?.[i] != null) pt.high = highs[i] as number;
			if (lows?.[i] != null) pt.low = lows[i] as number;
			if (volumes?.[i] != null) pt.volume = volumes[i] as number;
			points.push(pt);
		}
		if (points.length < 2) return null;

		// Coarse intervals (weekly/monthly on 5y/all) leave the last candle days or
		// weeks stale, so the headline price would lag reality. Append the live tick
		// from the same response — no extra request — when it's newer than the last
		// candle. Harmless on daily ranges (regularMarketTime ≈ today's candle).
		const liveT = meta?.regularMarketTime;
		const liveP = meta?.regularMarketPrice;
		if (typeof liveP === 'number' && liveP > 0 && typeof liveT === 'number' && liveT > points[points.length - 1].t) {
			points.push({ t: liveT, price: liveP });
		}

		const out: HistoryData = {
			symbol: symbol.toUpperCase(),
			range: yRange,
			points,
			source: 'yahoo',
		};
		const name = meta?.longName ?? meta?.shortName;
		if (name) out.name = name;
		if (meta?.fiftyTwoWeekHigh > 0) out.week52_high = meta.fiftyTwoWeekHigh;
		if (meta?.fiftyTwoWeekLow > 0) out.week52_low = meta.fiftyTwoWeekLow;
		return out;
	}
	catch (e) {
		logger.warn(`Yahoo history fetch failed for ${symbol} (${yRange}):`, e);
		return null;
	}
}

interface HistoryCacheEntry { data: HistoryData; ts: number }
const historyCache = new Map<string, HistoryCacheEntry>();
const HISTORY_TTL_MS = 5 * 60_000;
const HISTORY_MAX = 200;

export function clearHistoryCache() {
	historyCache.clear();
}

export async function getHistory(symbol: string, range: string, type: AssetType, force = false): Promise<HistoryData | null> {
	const conf = RANGE_INTERVAL[range];
	if (!conf) return null;
	const normalized = normalizeSymbol(symbol, type);
	const cacheKey = `${normalized}:${range}`;

	const hit = force ? undefined : historyCache.get(cacheKey);
	if (hit && Date.now() - hit.ts < HISTORY_TTL_MS) return hit.data;

	// Fundamentals in parallel so the history view carries the same strip as the
	// live view (getFundamentals no-ops for crypto/commodity and is cached).
	const [fetched, fundamentals] = await Promise.all([
		fetchYahooHistory(normalized, conf.range, conf.interval),
		getFundamentals(normalized),
	]);
	if (!fetched) return null;
	const out: HistoryData = {
		...fetched, symbol: symbol.toUpperCase(), query_symbol: normalized, range,
		market_cap: fundamentals.market_cap,
		pe_ratio: fundamentals.pe_ratio,
		dividend_yield: fundamentals.dividend_yield,
		next_earnings: fundamentals.next_earnings,
	};

	if (historyCache.size >= HISTORY_MAX) {
		const oldest = historyCache.keys().next().value;
		if (oldest) historyCache.delete(oldest);
	}
	historyCache.set(cacheKey, { data: out, ts: Date.now() });
	return out;
}
