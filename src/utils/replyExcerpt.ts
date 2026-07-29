import type { Message } from 'discord.js';

// Helpers for turning a replied-to message into a short excerpt the AI can use as
// a referent. When a user replies to one of the bot's rich cards (price card,
// weather, watchlist, flight…) with a follow-up like "why is it down?", the model
// needs to know which card is being referenced — otherwise it free-associates.
//
// FOR FUTURE EMBEDS: embedsToText below already pulls every text-bearing slot an
// embed can carry (author name, title, description, field name/value pairs,
// footer), so a new embed is covered automatically AS LONG AS its meaningful text
// lives in one of those slots. The one gotcha is image-only cards that render all
// their content into an attached PNG (e.g. the watchlist card): those expose no
// embed text, so make sure such a card at least carries a descriptive footer or
// title, or a reply to it will still be contextless.

// Short, single-line excerpt of a replied-to message. Strips any <msg> wrapper,
// collapses whitespace, and truncates.
export function quoteExcerpt(text: string, maxLen = 300): string {
	const clean = text
		.replace(/<msg\s+from="[^"]*">/gi, '')
		.replace(/<\/msg>/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
	return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
}

// True when a replied-to message is one of the bot's finance cards, so a bare
// follow-up ("why is it down?") routes to Claude's grounded finance path instead
// of Grok. Detected structurally by footer shape rather than by sniffing the
// excerpt text — the excerpt would miss commodity cards, whose footer keyword
// ("commodity") isn't in the finance-keyword regex.
//   - asset price/history card: footer `<type> • [<range> •] <source>`, e.g.
//     "stock • yahoo" / "commodity • 1M • yahoo"  (getAssetEmbed/getHistoryEmbed)
//   - watchlist card: footer "… • N tickers • 1D • yahoo"  (buildWatchlistMessage)
// If either footer format changes, update this regex.
const FINANCE_FOOTER_RE = /(\b(?:stock|crypto|commodity)\b.*\b(?:yahoo|finnhub)\b)|(\btickers?\b.*\byahoo\b)/i;

export function isFinancialEmbed(message: Pick<Message, 'embeds'>): boolean {
	return message.embeds.some(e => FINANCE_FOOTER_RE.test(e.footer?.text ?? ''));
}

// Flatten a message's embeds into a single text line. Empty slots are dropped so
// joins never emit stray separators, and ANSI color codes (pnl/recap code blocks)
// are stripped so the excerpt is plain text.
export function embedsToText(message: Pick<Message, 'embeds'>): string {
	return message.embeds
		.map(e => [
			e.author?.name,
			e.title,
			e.description,
			...e.fields.flatMap(f => [f.name, f.value]),
			e.footer?.text,
		].filter(Boolean).join(' — '))
		.filter(Boolean)
		.join('; ')
		// eslint-disable-next-line no-control-regex
		.replace(/\[[0-9;]*m/g, '');
}
