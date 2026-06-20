import { describe, it, expect } from 'vitest';
import { isToolLoopActive, getToolUses } from './toolLoop';

describe('isToolLoopActive', () => {
	it('is active for tool_use and pause_turn', () => {
		expect(isToolLoopActive('tool_use')).toBe(true);
		expect(isToolLoopActive('pause_turn')).toBe(true);
	});

	it('is inactive for terminal / non-tool stop reasons', () => {
		expect(isToolLoopActive('end_turn')).toBe(false);
		expect(isToolLoopActive('max_tokens')).toBe(false);
		expect(isToolLoopActive('refusal')).toBe(false);
		expect(isToolLoopActive(null)).toBe(false);
		expect(isToolLoopActive(undefined)).toBe(false);
	});
});

describe('getToolUses', () => {
	const toolUse = { type: 'tool_use', id: 't1', name: 'get_price', input: {} };
	const serverToolUse = { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} };
	const webSearchResult = { type: 'web_search_tool_result', tool_use_id: 's1', content: [] };
	const text = { type: 'text', text: 'hello' };

	it('returns client tool_use blocks', () => {
		const result = getToolUses([text, toolUse] as any);
		expect(result).toEqual([toolUse]);
	});

	// Regression: a web-search-only turn must yield NO executable tool_uses, so the loop
	// continues (re-sends to resume) instead of treating it as terminal and returning no text.
	it('excludes server_tool_use / web_search_tool_result blocks', () => {
		const result = getToolUses([serverToolUse, webSearchResult, text] as any);
		expect(result).toEqual([]);
	});

	it('returns only the tool_use from a mixed turn', () => {
		const result = getToolUses([serverToolUse, toolUse, webSearchResult] as any);
		expect(result).toEqual([toolUse]);
	});

	it('returns empty for a plain text turn', () => {
		expect(getToolUses([text] as any)).toEqual([]);
	});
});
