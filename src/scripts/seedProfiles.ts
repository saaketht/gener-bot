/**
 * seed-profiles.ts
 *
 * Two-phase workflow for seeding user personality profiles:
 *
 * Phase 1 — Scrape:
 *   npm run seed-profiles -- scrape --channel <id> [--days <n>]
 *   Fetches channel history, pairs "ai <msg>" prompts with bot responses,
 *   saves to data/exchanges-<channelId>.json for review.
 *
 * Phase 2 — Generate:
 *   npm run seed-profiles -- generate [--cache <path>] [--dry-run]
 *   Reads cached exchanges, generates profiles via Claude Opus,
 *   and upserts to user_profiles table (unless --dry-run).
 */

import { config } from 'dotenv';
config({ override: true });
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { UserProfiles } from '../models/dbObjects';

// ── Config ────────────────────────────────────────────────────────────────────

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.token;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DATA_DIR = path.resolve(__dirname, '../../data');

// ── Arg parsing ───────────────────────────────────────────────────────────────

function arg(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const subcommand = process.argv[2];

// ── Discord REST helpers ───────────────────────────────────────────────────────

interface DiscordMessage {
	id: string;
	content: string;
	author: { id: string; username: string; bot?: boolean };
	timestamp: string;
}

async function fetchMessages(channel: string, before?: string): Promise<DiscordMessage[]> {
	const params = new URLSearchParams({ limit: '100' });
	if (before) params.set('before', before);

	const res = await fetch(`${DISCORD_API}/channels/${channel}/messages?${params}`, {
		headers: { Authorization: `Bot ${BOT_TOKEN}` },
	});

	if (res.status === 429) {
		const body: any = await res.json();
		const waitMs = Math.ceil((body.retry_after ?? 1) * 1000);
		process.stdout.write(` [rate limited, waiting ${waitMs}ms]`);
		await new Promise(r => setTimeout(r, waitMs));
		return fetchMessages(channel, before);
	}

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Discord API ${res.status}: ${body}`);
	}
	return res.json() as Promise<DiscordMessage[]>;
}

async function fetchBotId(): Promise<string> {
	const res = await fetch(`${DISCORD_API}/users/@me`, {
		headers: { Authorization: `Bot ${BOT_TOKEN}` },
	});
	if (!res.ok) throw new Error(`Could not fetch bot user: ${res.status}`);
	const data: any = await res.json();
	return data.id as string;
}

// ── Scrape + pair ─────────────────────────────────────────────────────────────

interface Exchange {
	userMessage: string;
	botResponse: string;
	timestamp: number;
}

interface UserExchanges {
	username: string;
	exchanges: Exchange[];
}

type ExchangeCache = Record<string, UserExchanges>;

async function scrapeChannel(channel: string, sinceMs: number): Promise<DiscordMessage[]> {
	const all: DiscordMessage[] = [];
	let before: string | undefined;
	let fetched = 0;

	process.stdout.write('Fetching messages');
	for (;;) {
		const batch = await fetchMessages(channel, before);
		if (batch.length === 0) break;

		const oldest = batch[batch.length - 1];
		const oldestMs = new Date(oldest.timestamp).getTime();

		for (const msg of batch) {
			if (new Date(msg.timestamp).getTime() >= sinceMs) {
				all.push(msg);
			}
		}

		fetched += batch.length;
		process.stdout.write('.');

		if (oldestMs < sinceMs || batch.length < 100) break;
		before = oldest.id;
		await new Promise(r => setTimeout(r, 500));
	}

	console.log(` done (${fetched} fetched, ${all.length} within window).`);
	return all;
}

function pairExchanges(
	messages: DiscordMessage[],
	botId: string,
): ExchangeCache {
	const sorted = [...messages].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);

	const byUser: ExchangeCache = {};

	for (let i = 0; i < sorted.length; i++) {
		const msg = sorted[i];
		if (msg.author.bot) continue;

		const lower = msg.content.toLowerCase().trim();
		if (!lower.startsWith('ai ') && lower !== 'ai') continue;

		let botReply: DiscordMessage | undefined;
		for (let j = i + 1; j < Math.min(i + 6, sorted.length); j++) {
			if (sorted[j].author.id === botId) {
				botReply = sorted[j];
				break;
			}
		}
		if (!botReply) continue;

		const userId = msg.author.id;
		if (!byUser[userId]) {
			byUser[userId] = { username: msg.author.username, exchanges: [] };
		}

		byUser[userId].exchanges.push({
			userMessage: msg.content.replace(/^ai\s*/i, '').trim(),
			botResponse: botReply.content,
			timestamp: new Date(msg.timestamp).getTime(),
		});
	}

	return byUser;
}

// ── Stratified sampling ─────────────────────────────────────────────────────

function stratifiedSample(exchanges: Exchange[], maxTotal: number): Exchange[] {
	if (exchanges.length <= maxTotal) return exchanges;

	const sorted = [...exchanges].sort((a, b) => a.timestamp - b.timestamp);
	const earliest = sorted[0].timestamp;
	const latest = sorted[sorted.length - 1].timestamp;
	const range = latest - earliest;

	if (range === 0) return sorted.slice(0, maxTotal);

	const bucketCount = Math.min(5, maxTotal);
	const perBucket = Math.ceil(maxTotal / bucketCount);
	const bucketSize = range / bucketCount;

	const buckets: Exchange[][] = Array.from({ length: bucketCount }, () => []);
	for (const ex of sorted) {
		const idx = Math.min(Math.floor((ex.timestamp - earliest) / bucketSize), bucketCount - 1);
		buckets[idx].push(ex);
	}

	const sampled: Exchange[] = [];
	for (const bucket of buckets) {
		if (bucket.length <= perBucket) {
			sampled.push(...bucket);
		}
		else {
			const step = bucket.length / perBucket;
			for (let i = 0; i < perBucket; i++) {
				sampled.push(bucket[Math.floor(i * step)]);
			}
		}
	}

	return sampled.sort((a, b) => a.timestamp - b.timestamp).slice(0, maxTotal);
}

// ── Profile generation via Claude ───────────────────────────────────────────

const PROFILE_PROMPT = `You are a memory assistant for a Discord bot. Analyze this user's chat history and write a concise personality profile. Focus on STABLE traits over transient topics.

Structure your notes as:
- **Communication style**: How they talk — verbose/terse, formal/casual, emoji usage, humor type (sarcastic, dry, playful, etc.)
- **Personality & social role**: Are they a helper, provocateur, lurker-who-surfaces, debate-starter? Agreeable or contrarian? Confident or uncertain?
- **Recurring interests**: Only include interests that appear across MULTIPLE time periods, not one-off mentions. If they asked about crypto once, that's not an interest.
- **Quirks**: Any distinctive patterns — catchphrases, running jokes, unusual formatting habits, how they interact with the bot specifically.

Rules:
- Be specific and evidence-based. "Uses dry humor" is weak. "Deadpans absurd requests as if serious" is strong.
- Skip anything generic that could describe anyone ("likes having fun", "uses the bot sometimes").
- 3-5 bullet points max. Quality over quantity.
- Output only the notes, no preamble.`;

// Known context about specific users — included in the generation prompt
const USER_CONTEXT: Record<string, string> = {
	'521894323403358219': 'This user is the sole developer of this bot.',
};

async function generateNotes(userId: string, username: string, exchanges: Exchange[]): Promise<string> {
	if (!ANTHROPIC_KEY) {
		throw new Error('Missing env var: ANTHROPIC_API_KEY');
	}

	const claude = new Anthropic({ apiKey: ANTHROPIC_KEY });
	const sampled = stratifiedSample(exchanges, 25);

	const transcript = sampled
		.map(e => {
			const date = new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			return `[${date}] ${username}: ${e.userMessage}\nbot: ${e.botResponse}`;
		})
		.join('\n\n');

	const response = await claude.messages.create({
		model: 'claude-opus-4-6',
		max_tokens: 300,
		messages: [
			{
				role: 'user',
				content: `Username: ${username}\n${USER_CONTEXT[userId] ? `Context: ${USER_CONTEXT[userId]}\n` : ''}Total interactions: ${exchanges.length}\nTime span: ${new Date(exchanges[0].timestamp).toLocaleDateString()} — ${new Date(exchanges[exchanges.length - 1].timestamp).toLocaleDateString()}\n\nSampled chat history (stratified across the full time range):\n${transcript}`,
			},
		],
		system: PROFILE_PROMPT,
	});

	const block = response.content[0];
	return block.type === 'text' ? block.text.trim() : '';
}

// ── Subcommands ──────────────────────────────────────────────────────────────

async function runScrape() {
	if (!BOT_TOKEN) {
		console.error('Missing env var: token');
		process.exit(1);
	}

	const channelId = arg('--channel');
	const daysBack = parseInt(arg('--days') ?? '30', 10);

	if (!channelId) {
		console.error('Usage: npm run seed-profiles -- scrape --channel <id> [--days <n>]');
		process.exit(1);
	}

	const sinceMs = Date.now() - daysBack * 24 * 60 * 60 * 1000;
	console.log(`\nScraping #${channelId}, ${daysBack} days back (since ${new Date(sinceMs).toDateString()})`);

	const botId = await fetchBotId();
	const messages = await scrapeChannel(channelId, sinceMs);
	const exchanges = pairExchanges(messages, botId);

	const userCount = Object.keys(exchanges).length;
	const totalExchanges = Object.values(exchanges).reduce((sum, u) => sum + u.exchanges.length, 0);

	if (userCount === 0) {
		console.log('No "ai <message>" exchanges found.');
		return;
	}

	// Write cache
	if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
	const cachePath = path.join(DATA_DIR, `exchanges-${channelId}.json`);
	fs.writeFileSync(cachePath, JSON.stringify(exchanges, null, 2));

	console.log(`\nCached ${totalExchanges} exchanges from ${userCount} user(s) → ${cachePath}`);

	// Print summary
	for (const [userId, { username, exchanges: exs }] of Object.entries(exchanges)) {
		const first = new Date(exs[0].timestamp).toLocaleDateString();
		const last = new Date(exs[exs.length - 1].timestamp).toLocaleDateString();
		console.log(`  ${username} (${userId}): ${exs.length} exchanges, ${first} — ${last}`);
	}
}

async function runGenerate() {
	const cachePath = arg('--cache');
	const dryRun = process.argv.includes('--dry-run');

	if (!cachePath) {
		console.error('Usage: npm run seed-profiles -- generate --cache <path> [--dry-run]');
		process.exit(1);
	}

	if (!fs.existsSync(cachePath)) {
		console.error(`Cache file not found: ${cachePath}`);
		process.exit(1);
	}

	const exchanges: ExchangeCache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
	const userCount = Object.keys(exchanges).length;

	console.log(`\nGenerating profiles for ${userCount} user(s) from ${cachePath}`);
	if (dryRun) console.log('DRY RUN — no DB writes\n');

	for (const [userId, { username, exchanges: exs }] of Object.entries(exchanges)) {
		console.log(`  ${username} (${userId}) — ${exs.length} exchange(s)`);

		if (exs.length < 3) {
			console.log('    → skipping (fewer than 3 exchanges)\n');
			continue;
		}

		process.stdout.write('    → generating via Claude Opus...');
		const notes = await generateNotes(userId, username, exs);
		console.log(' done');
		console.log(`    notes:\n${notes.split('\n').map(l => `      ${l}`).join('\n')}\n`);

		if (!dryRun) {
			await (UserProfiles as any).upsert({
				user_id: userId,
				username,
				notes,
				interaction_count: exs.length,
				last_updated: new Date(),
			});
			console.log('    → saved to DB\n');
		}

		await new Promise(r => setTimeout(r, 1000));
	}

	console.log(dryRun ? 'Dry run complete.' : 'Done. Profiles seeded.');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	if (subcommand === 'scrape') {
		await runScrape();
	}
	else if (subcommand === 'generate') {
		await runGenerate();
	}
	else {
		console.error('Usage:');
		console.error('  npm run seed-profiles -- scrape --channel <id> [--days <n>]');
		console.error('  npm run seed-profiles -- generate --cache <path> [--dry-run]');
		process.exit(1);
	}
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
