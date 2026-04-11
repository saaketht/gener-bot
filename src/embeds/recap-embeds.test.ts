import { describe, it, expect } from 'vitest';
import {
	getUniqueTradingDays,
	getDaySummary,
	buildRecapBlock,
	getRecapEmbed,
	parseCashFlowJson,
	getCashFlowEmbed,
} from './recap-embeds';
import { parseTradesCSV } from './pnl-embeds';

const SAMPLE_CSV = `Trade #,Date,Day,Account,Symbol,Expiry Date,Type,Strike,Qty,Asset Open,Asset High,Asset Low,Asset Close,VWAP,8 EMA,Entry Time,Exit Time,Hold Time (min),Entry Hour,Entry Cost,Risk ($),Exit Credit,P/L ($),Cumulative P/L ($),P/L (%),Win/Loss,Is Win,VIX,Delta,Group ID,DTE
1,4/7/2026,Mon,950566109,SPY,4/7/2026,Call,660.0,2,,,,,659.75,659.47,10:30:00,10:45:00,15,10,-300,300,450,150,150,50.0,WIN,1,26.5,,G225,0
2,4/7/2026,Mon,950566109,SPY,4/7/2026,Put,659.0,1,,,,,659.75,659.47,11:00:00,11:30:00,30,11,-193,193,95,-98,52,-50.777202,LOSS,0,26.5,,G226,0
3,4/8/2026,Tue,950566109,SPY,4/8/2026,Call,655.0,1,,,,,,,09:30:00,10:00:00,30,9,-100,100,200,100,100,100.0,WIN,1,20.0,,G220,0
4,4/9/2026,Wed,950566109,SPY,4/9/2026,Put,658.0,1,,,,,,,10:00:00,10:30:00,30,10,-150,150,50,-100,-100,-66.666667,LOSS,0,22.0,,G230,0
5,4/10/2026,Thu,950566109,SPY,4/10/2026,Call,662.0,1,,,,,,,09:45:00,10:15:00,30,9,-200,200,350,150,150,75.0,WIN,1,18.0,,G235,0`;

const allTrades = parseTradesCSV(SAMPLE_CSV);

describe('getUniqueTradingDays', () => {
	it('returns unique dates sorted most-recent first', () => {
		const days = getUniqueTradingDays(allTrades);
		expect(days).toEqual(['4/10/2026', '4/9/2026', '4/8/2026', '4/7/2026']);
	});

	it('returns empty for no trades', () => {
		expect(getUniqueTradingDays([])).toEqual([]);
	});

	it('deduplicates same-day trades', () => {
		const days = getUniqueTradingDays(allTrades);
		expect(days.filter(d => d === '4/7/2026')).toHaveLength(1);
	});
});

describe('getDaySummary', () => {
	it('aggregates single-day trades', () => {
		const dayTrades = allTrades.filter(t => t.date === '4/7/2026');
		const summary = getDaySummary(dayTrades);
		expect(summary.date).toBe('4/7/2026');
		// 150 + (-98) = 52
		expect(summary.pnl).toBe(52);
		expect(summary.wins).toBe(1);
		expect(summary.losses).toBe(1);
		expect(summary.tradeCount).toBe(2);
		// 300 + 193
		expect(summary.totalRisk).toBe(493);
	});

	it('computes pnlPct from risk', () => {
		const dayTrades = allTrades.filter(t => t.date === '4/8/2026');
		const summary = getDaySummary(dayTrades);
		expect(summary.pnlPct).toBeCloseTo(100.0);
	});
});

describe('buildRecapBlock', () => {
	it('wraps in ansi code block', () => {
		const summaries = [getDaySummary(allTrades.filter(t => t.date === '4/7/2026'))];
		const block = buildRecapBlock(summaries);
		expect(block).toMatch(/^```ansi\n/);
		expect(block).toMatch(/\n```$/);
	});
});

describe('getRecapEmbed', () => {
	it('limits to requested day count', () => {
		const embed = getRecapEmbed(allTrades, 2);
		// Title should say "Last 2 Trading Days"
		expect(embed.data.title).toContain('Last 2');
	});

	it('shows all days when fewer exist than requested', () => {
		const embed = getRecapEmbed(allTrades, 10);
		// Only 4 unique days in sample
		expect(embed.data.title).toContain('Last 4');
	});

	it('sets green color for positive aggregate', () => {
		const embed = getRecapEmbed(allTrades, 5);
		// Total: 150 + (-98) + 100 + (-100) + 150 = 202 (positive)
		expect(embed.data.color).toBe(0x57F287);
	});

	it('includes NET P/L field', () => {
		const embed = getRecapEmbed(allTrades, 5);
		const field = embed.data.fields?.find(f => f.name === 'NET P/L');
		expect(field).toBeDefined();
		expect(field?.value).toContain('$202');
	});

	it('includes BEST DAY field', () => {
		const embed = getRecapEmbed(allTrades, 5);
		const field = embed.data.fields?.find(f => f.name === 'BEST DAY');
		expect(field).toBeDefined();
		expect(field?.value).toContain('$150');
	});

	it('includes RECORD field', () => {
		const embed = getRecapEmbed(allTrades, 5);
		const field = embed.data.fields?.find(f => f.name === 'RECORD');
		expect(field?.value).toContain('3 - 2');
		expect(field?.value).toContain('5 trades');
	});

	it('includes daily block with ansi', () => {
		const embed = getRecapEmbed(allTrades, 5);
		const field = embed.data.fields?.find(f => f.name === 'DAILY P/L');
		expect(field?.value).toContain('```ansi');
	});

	it('detailed mode shows DAILY BREAKDOWN', () => {
		const embed = getRecapEmbed(allTrades, 5, true);
		const field = embed.data.fields?.find(f => f.name === 'DAILY BREAKDOWN');
		expect(field).toBeDefined();
		expect(field?.value).toContain('```ansi');
	});

	it('includes win bar in footer', () => {
		const embed = getRecapEmbed(allTrades, 5);
		expect(embed.data.footer?.text).toContain('win rate');
	});
});

const SAMPLE_JSON = JSON.stringify({
	deposits: 10000.00,
	withdrawals: 2000.00,
	net_deposited: 8000.00,
	gold_fees: 50.00,
	dividends: 25.50,
	referral_grants: 100.00,
	net_cash_basis: 8075.50,
	current_equity: 9500.00,
	all_time_pnl: 1424.50,
	all_time_pnl_pct: 14.2,
	total_return: 1500.00,
	total_return_pct: 15.0,
});

describe('parseCashFlowJson', () => {
	it('parses all fields', () => {
		const s = parseCashFlowJson(SAMPLE_JSON);
		expect(s.deposits).toBe(10000);
		expect(s.withdrawals).toBe(2000);
		expect(s.netDeposited).toBe(8000);
		expect(s.goldFees).toBe(50);
		expect(s.dividends).toBe(25.5);
		expect(s.referralGrants).toBe(100);
		expect(s.netCashBasis).toBe(8075.5);
		expect(s.currentEquity).toBe(9500);
		expect(s.allTimePnl).toBe(1424.5);
		expect(s.allTimePnlPct).toBe(14.2);
		expect(s.totalReturn).toBe(1500);
		expect(s.totalReturnPct).toBe(15);
	});
});

describe('getCashFlowEmbed', () => {
	const summary = parseCashFlowJson(SAMPLE_JSON);

	it('sets green color for positive P/L', () => {
		const embed = getCashFlowEmbed(summary);
		expect(embed.data.color).toBe(0x57F287);
	});

	it('includes DEPOSITED field', () => {
		const embed = getCashFlowEmbed(summary);
		const field = embed.data.fields?.find(f => f.name === 'DEPOSITED');
		expect(field).toBeDefined();
		expect(field?.value).toContain('$8,000');
	});

	it('includes EQUITY field', () => {
		const embed = getCashFlowEmbed(summary);
		const field = embed.data.fields?.find(f => f.name === 'EQUITY');
		expect(field).toBeDefined();
		expect(field?.value).toContain('$9,500');
	});

	it('includes ALL-TIME P/L field', () => {
		const embed = getCashFlowEmbed(summary);
		const field = embed.data.fields?.find(f => f.name === 'ALL-TIME P/L');
		expect(field).toBeDefined();
		expect(field?.value).toContain('$1,425');
	});

	it('includes BREAKDOWN field', () => {
		const embed = getCashFlowEmbed(summary);
		const field = embed.data.fields?.find(f => f.name === 'BREAKDOWN');
		expect(field?.value).toContain('Deposits');
		expect(field?.value).toContain('Gold fees');
	});

	it('includes total return in footer', () => {
		const embed = getCashFlowEmbed(summary);
		expect(embed.data.footer?.text).toContain('Total return');
		expect(embed.data.footer?.text).toContain('$1,500');
	});

	it('sets red color for negative P/L', () => {
		const neg = parseCashFlowJson(JSON.stringify({
			...JSON.parse(SAMPLE_JSON),
			all_time_pnl: -500,
			all_time_pnl_pct: -5.0,
		}));
		const embed = getCashFlowEmbed(neg);
		expect(embed.data.color).toBe(0xED4245);
	});
});
