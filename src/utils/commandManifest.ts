/**
 * Single source of truth for all bot capabilities.
 * Injected into the AI system prompt so the LLM can suggest commands contextually.
 * Also importable by a future /help slash command.
 */
export const COMMAND_MANIFEST = `
Slash commands:
- /balance — check your coin balance
- /daily — claim 100 coins (24h cooldown)
- /shop [item] — view shop or buy items (Tea 1c, Coffee 2c, Cake 5c)
- /user — view your Discord profile info
- /avatar — display a user's avatar
- /flight track|list|remove — track real-time flights
- /ping — check bot latency
- /server — view server info

Message commands (type these in chat):
- "ai <message>" — talk to me (can also pull up PNL, prices, charts, flights, weather, and images, set reminders, and remember things about users)
- "remindme <duration> <message>" — ping you after a delay (e.g. remindme 1h30m check oven)
- "reset" / "new chat" — wipe my memory of this channel's conversation
- "watchlist" — your watchlist (or the guild's), paginated price card
- "watchlist add|remove <sym> [guild]" — curate your list, or the shared guild list
- "ai-image <prompt>" — generate an image
- "ai-video <prompt>" — generate a video
- "weather <city>" — get weather
- "flight <number>" — look up a flight
- "pnl" — track P&L from CSV
- "recap" — 5-day trading recap
- "recap all" — all-time P/L overview
- "warframe <query>" — Warframe game data
- "$<ticker>" — live price card for any symbol (stocks/ETFs, common crypto, commodities)
- "food <type>" — food/recipe lookup
- "imagesearch <query>" — image search
`.trim();
