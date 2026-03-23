import { describe, it, expect } from 'vitest';
import {
	parseTradesCSV,
	normalizeDate,
	formatDateHuman,
	getPnlEmbed,
	getNoTradesEmbed,
	groupTrades,
	sortTrades,
	buildTradeBlock,
	buildWinBar,
	Trade,
} from './pnl-embeds';

const SAMPLE_CSV = `Trade #,Date,Day,Account,Symbol,Expiry Date,Type,Strike,Qty,Asset Open,Asset High,Asset Low,Asset Close,VWAP,8 EMA,Entry Time,Exit Time,Hold Time (min),Entry Hour,Entry Cost,Risk ($),Exit Credit,P/L ($),Cumulative P/L ($),P/L (%),Win/Loss,Is Win,VIX,Delta,Group ID,DTE
1,3/23/2026,Mon,950566109,SPY,3/23/2026,Call,660.0,2,,,,,659.75,659.47,10:30:00,10:45:00,15,10,-300,300,450,150,150,50.0,WIN,1,26.5,,G225,0
2,3/23/2026,Mon,950566109,SPY,3/23/2026,Put,659.0,1,,,,,659.75,659.47,11:00:00,11:30:00,30,11,-193,193,95,-98,52,-50.777202,LOSS,0,26.5,,G226,0
3,3/22/2026,Sun,950566109,SPY,3/22/2026,Call,655.0,1,,,,,,,09:30:00,10:00:00,30,9,-100,100,200,100,100,100.0,WIN,1,20.0,,G220,0`;

describe('parseTradesCSV', () => {
	it('parses all rows', () => {
		const trades = parseTradesCSV(SAMPLE_CSV);
		expect(trades).toHaveLength(3);
	});

	it('parses fields correctly', () => {
		const trades = parseTradesCSV(SAMPLE_CSV);
		const t = trades[0];
		expect(t.tradeNum).toBe(1);
		expect(t.date).toBe('3/23/2026');
		expect(t.type).toBe('Call');
		expect(t.strike).toBe(660.0);
		expect(t.qty).toBe(2);
		expect(t.entryCost).toBe(-300);
		expect(t.exitCredit).toBe(450);
		expect(t.pnl).toBe(150);
		expect(t.isWin).toBe(true);
		expect(t.groupId).toBe('G225');
	});

	it('returns empty for header-only CSV', () => {
		const header = SAMPLE_CSV.split('\n')[0];
		expect(parseTradesCSV(header)).toHaveLength(0);
	});

	it('returns empty for empty string', () => {
		expect(parseTradesCSV('')).toHaveLength(0);
	});
});

describe('normalizeDate', () => {
	it('strips leading zeros', () => {
		expect(normalizeDate('03/09/2026')).toBe('3/9/2026');
	});

	it('passes through already-normalized dates', () => {
		expect(normalizeDate('3/23/2026')).toBe('3/23/2026');
	});

	it('returns original for invalid format', () => {
		expect(normalizeDate('2026-03-23')).toBe('2026-03-23');
	});
});

describe('formatDateHuman', () => {
	it('formats M/D/YYYY to human-readable', () => {
		expect(formatDateHuman('3/23/2026')).toBe('Mon, Mar 23 2026');
	});

	it('handles single-digit month and day', () => {
		expect(formatDateHuman('1/5/2026')).toBe('Mon, Jan 5 2026');
	});

	it('returns original for invalid format', () => {
		expect(formatDateHuman('2026-03-23')).toBe('2026-03-23');
	});
});

describe('groupTrades', () => {
	it('groups identical trades', () => {
		const trades: Trade[] = [
			{ tradeNum: 1, date: '3/23/2026', day: 'Mon', symbol: 'SPY', type: 'Put', strike: 659, qty: 1, entryTime: '11:51', exitTime: '11:55', holdTime: 4, entryCost: -193, exitCredit: 301, pnl: 108, pnlPct: 56.0, isWin: true, groupId: 'G1' },
			{ tradeNum: 2, date: '3/23/2026', day: 'Mon', symbol: 'SPY', type: 'Put', strike: 659, qty: 1, entryTime: '11:51', exitTime: '11:55', holdTime: 4, entryCost: -193, exitCredit: 301, pnl: 108, pnlPct: 56.0, isWin: true, groupId: 'G2' },
		];
		const grouped = groupTrades(trades);
		expect(grouped).toHaveLength(1);
		expect(grouped[0].qty).toBe(2);
		expect(grouped[0].pnl).toBe(216);
	});

	it('keeps different trades separate', () => {
		const trades: Trade[] = [
			{ tradeNum: 1, date: '3/23/2026', day: 'Mon', symbol: 'SPY', type: 'Put', strike: 659, qty: 1, entryTime: '11:51', exitTime: '11:55', holdTime: 4, entryCost: -193, exitCredit: 301, pnl: 108, pnlPct: 56.0, isWin: true, groupId: 'G1' },
			{ tradeNum: 2, date: '3/23/2026', day: 'Mon', symbol: 'SPY', type: 'Put', strike: 656, qty: 1, entryTime: '12:01', exitTime: '15:18', holdTime: 197, entryCost: -199, exitCredit: 20, pnl: -179, pnlPct: -89.9, isWin: false, groupId: 'G2' },
		];
		const grouped = groupTrades(trades);
		expect(grouped).toHaveLength(2);
	});
});

describe('sortTrades', () => {
	it('sorts wins first descending, then losses descending', () => {
		const grouped = [
			{ type: 'Put', strike: 659, qty: 1, bought: '1.93', sold: '0.95', pnl: -98, pnlPct: -50.8, holdTime: 172, isWin: false },
			{ type: 'Put', strike: 659, qty: 3, bought: '1.93', sold: '3.01', pnl: 324, pnlPct: 56.0, holdTime: 4, isWin: true },
			{ type: 'Put', strike: 654, qty: 1, bought: '0.95', sold: '1.40', pnl: 45, pnlPct: 47.4, holdTime: 14, isWin: true },
		];
		const sorted = sortTrades(grouped);
		expect(sorted[0].pnl).toBe(324);
		expect(sorted[1].pnl).toBe(45);
		expect(sorted[2].pnl).toBe(-98);
	});
});

describe('buildTradeBlock', () => {
	it('wraps in ansi code block', () => {
		const sorted = [
			{ type: 'Put', strike: 659, qty: 1, bought: '1.93', sold: '3.01', pnl: 108, pnlPct: 56.0, holdTime: 4, isWin: true },
		];
		const block = buildTradeBlock(sorted);
		expect(block).toMatch(/^```ansi\n/);
		expect(block).toMatch(/\n```$/);
	});

	it('separates wins and losses with divider', () => {
		const sorted = [
			{ type: 'Put', strike: 659, qty: 1, bought: '1.93', sold: '3.01', pnl: 108, pnlPct: 56.0, holdTime: 4, isWin: true },
			{ type: 'Put', strike: 656, qty: 1, bought: '1.99', sold: '0.20', pnl: -179, pnlPct: -89.9, holdTime: 197, isWin: false },
		];
		const block = buildTradeBlock(sorted);
		expect(block).toContain('─');
	});

	it('omits divider when all wins', () => {
		const sorted = [
			{ type: 'Put', strike: 659, qty: 1, bought: '1.93', sold: '3.01', pnl: 108, pnlPct: 56.0, holdTime: 4, isWin: true },
		];
		const block = buildTradeBlock(sorted);
		expect(block).not.toContain('─');
	});
});

describe('buildWinBar', () => {
	it('shows correct emoji counts and win rate', () => {
		const bar = buildWinBar(6, 3);
		expect(bar).toContain('🟩🟩🟩🟩🟩🟩');
		expect(bar).toContain('🟥🟥🟥');
		expect(bar).toContain('67% win rate');
	});
});

describe('getPnlEmbed', () => {
	const trades = parseTradesCSV(SAMPLE_CSV).filter(t => t.date === '3/23/2026');

	it('sets green color for positive P/L', () => {
		const embed = getPnlEmbed(trades, '3/23/2026');
		expect(embed.data.color).toBe(0x57F287);
	});

	it('includes win bar in footer', () => {
		const embed = getPnlEmbed(trades, '3/23/2026');
		expect(embed.data.footer?.text).toContain('win rate');
	});

	it('includes date in title with emoji', () => {
		const embed = getPnlEmbed(trades, '3/23/2026');
		expect(embed.data.title).toContain('📈 SPY 0DTE — 3/23/2026');
	});

	it('shows flavor text in description', () => {
		const embed = getPnlEmbed(trades, '3/23/2026');
		expect(embed.data.description).toContain('today');
	});

	it('includes NET P/L field', () => {
		const embed = getPnlEmbed(trades, '3/23/2026');
		const pnlField = embed.data.fields?.find(f => f.name === 'NET P/L');
		expect(pnlField).toBeDefined();
		// Total: 150 + (-98) = 52
		expect(pnlField?.value).toContain('$52');
	});

	it('includes RECORD field', () => {
		const embed = getPnlEmbed(trades, '3/23/2026');
		const recordField = embed.data.fields?.find(f => f.name === 'RECORD');
		expect(recordField?.value).toContain('1 - 1');
		expect(recordField?.value).toContain('2 trades');
	});

	it('includes RISKED field', () => {
		const embed = getPnlEmbed(trades, '3/23/2026');
		const riskedField = embed.data.fields?.find(f => f.name === 'RISKED');
		expect(riskedField?.value).toContain('$493');
	});

	it('includes TRADES field with ansi block', () => {
		const embed = getPnlEmbed(trades, '3/23/2026');
		const tradesField = embed.data.fields?.find(f => f.name === 'TRADES');
		expect(tradesField?.value).toContain('```ansi');
	});

	it('sets red color for negative P/L', () => {
		const lossTrades: Trade[] = [{
			tradeNum: 1, date: '3/23/2026', day: 'Mon', symbol: 'SPY',
			type: 'Put', strike: 660, qty: 1, entryTime: '10:00:00',
			exitTime: '10:30:00', holdTime: 30, entryCost: -200,
			exitCredit: 50, pnl: -150, pnlPct: -75, isWin: false, groupId: 'G1',
		}];
		const embed = getPnlEmbed(lossTrades, '3/23/2026');
		expect(embed.data.color).toBe(0xED4245);
	});

	it('shows detailed view when requested', () => {
		const embed = getPnlEmbed(trades, '3/23/2026', true);
		const tradesField = embed.data.fields?.find(f => f.name === 'TRADES');
		// Detailed view includes entry → exit prices
		expect(tradesField?.value).toContain('→');
	});
});

describe('getNoTradesEmbed', () => {
	it('includes date in title', () => {
		const embed = getNoTradesEmbed('3/23/2026');
		expect(embed.data.title).toContain('3/23/2026');
	});

	it('uses grey color', () => {
		const embed = getNoTradesEmbed('3/23/2026');
		expect(embed.data.color).toBe(0x6B7280);
	});
});
