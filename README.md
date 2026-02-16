# generBot

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![Claude AI](https://img.shields.io/badge/Claude_Haiku_4.5-Anthropic-D97706?logo=anthropic&logoColor=white)](https://www.anthropic.com/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A Discord bot exploring **event-driven architecture**, **third-party API integration**, and **real-time AI** — built with TypeScript and discord.js v14.

Integrates Claude Haiku 4.5 for AI chat with extended thinking, DALL-E 3 for image generation, live data from multiple APIs, and a persistent SQLite-backed economy system.

<!-- TODO: Add a screenshot/GIF of the bot in action here -->
<!-- ![Demo](docs/demo.gif) -->

## Tech Stack

- **TypeScript** with strict type definitions and custom interfaces
- **discord.js v14** — slash commands, message events, gateway events
- **Claude Haiku 4.5** (Anthropic SDK) — AI chat with extended thinking
- **DALL-E 3** (OpenAI SDK) — AI image generation
- **Sequelize** + SQLite — persistent user economy (balance, shop, inventory)
- **Mongoose** + MongoDB — server settings storage
- **Winston** — structured logging with sensitive data redaction
- **Fuse.js** — fuzzy search for Warframe item lookups

## Features

**Slash Commands** — Discord's native interaction system, registered via the API
- `/balance`, `/daily`, `/shop` — Persistent economy with SQLite-backed user data, item shop, and inventory
- `/ping`, `/avatar`, `/server`, `/user` — Standard utility commands

**Message Handlers** — Natural language triggers processed through a plugin-style event pipeline. Each handler implements the `MessageEvent` interface and is loaded dynamically — the bot listens to the message stream and each handler independently decides whether to act. This keeps handler logic decoupled and makes adding new triggers a single-file operation.
- `ai <prompt>` — Claude Haiku 4.5 with extended thinking, env-configurable personality, per-user rate limiting
- `ai-image <prompt>` — DALL-E 3 image generation with Discord embeds
- `crypto <symbol>` — Live cryptocurrency prices via RapidAPI
- `weather <city>` — Current weather conditions
- `imagesearch <query>` — Bing Image Search API
- `warframe <item>` — Fuzzy search across the full Warframe item database

## Architecture

```
src/
├── index.ts              # Entry point — client setup, handler registration
├── deploy-commands.ts    # Slash command registration with Discord API
├── types/                # TypeScript interfaces (Command, DiscordClient, etc.)
├── commands/
│   ├── slash/            # Slash commands (/ping, /balance, /shop, etc.)
│   └── message-events/   # Message triggers (ai, crypto, weather, etc.)
├── events/               # Discord gateway events (ready, interactionCreate)
├── models/               # Sequelize models, DB init, Mongoose schemas
├── embeds/               # Discord embed builders
├── utils/                # Logger, rate limiter, dynamic handler loader
└── interfaces/           # Data type interfaces (Warframe items, etc.)
```

### Design Decisions

- **Dynamic handler loading** — Commands, message events, and gateway events are discovered at runtime via glob patterns (`utils/loader.ts`). Adding a new command means creating a file that implements the `Command` or `MessageEvent` interface — no manual registration or routing needed.
- **Type-safe handler system** — Custom type definitions for all handler interfaces (`Command`, `MessageEvent`, `DiscordEvent`) with an extended `DiscordClient` type that carries the commands collection, active games map, and database references.
- **Environment-driven configuration** — AI system prompt, model selection, and all API keys are externalized to `.env`. The bot personality is fully configurable without code changes.
- **Per-user rate limiting** — In-memory rate limiter with automatic cleanup, applied per-command to prevent API abuse.
- **Sensitive data redaction** — Winston logger automatically redacts API keys and tokens from log output.

## Setup

```bash
git clone https://github.com/saaketht/gener-bot.git
cd gener-bot
cp .env.example .env     # Add your API keys
npm install
npm run deploy-commands   # Register slash commands with Discord
npm run start
```

See `.env.example` for all configuration options.

## Development

```bash
npm run dev       # Auto-restart on changes (nodemon)
npm run build     # Compile TypeScript to built/
npm run lint      # ESLint with TypeScript rules
```

## License

[Apache License 2.0](LICENSE)
