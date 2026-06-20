import type Anthropic from '@anthropic-ai/sdk';

// Pure helpers for the Claude tool loop in ai-complete.ts, extracted so the
// block-classification logic (the source of a real bug) can be unit-tested without
// importing the whole handler (which pulls in Sequelize/Discord side effects).

// The loop has more to do while Claude either wants a client-side tool run (`tool_use`)
// or has a paused server-side tool to resume (`pause_turn`).
export function isToolLoopActive(stopReason: string | null | undefined): boolean {
	return stopReason === 'tool_use' || stopReason === 'pause_turn';
}

// Only `tool_use` blocks are client-executed. Server-side tools (web_search) emit
// `server_tool_use` blocks, which the API runs itself — they must NOT be treated as
// executable, or a search-only turn looks like "nothing to do" and the loop bails with
// no text. This is exactly the bug the regression test guards against.
export function getToolUses(content: Anthropic.ContentBlock[]): Anthropic.ToolUseBlock[] {
	return content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
}
