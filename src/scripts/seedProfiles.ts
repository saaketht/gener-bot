/**
 * seed-profiles.ts
 *
 * Scans a Discord channel's history, pairs "ai <message>" prompts with bot
 * responses, and generates/upserts personality notes for each user into the
 * user_profiles table via Grok.
 *
 * Usage:
 *   npm run seed-profiles -- --channel <channelId> [--days <n>] [--dry-run]
 *
 * Options:
 *   --channel <id>   Required. Discord channel ID to scan.
 *   --days <n>       How far back to look (default: 30).
 *   --dry-run        Fetch and print what would be generated, no DB writes.
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { UserProfiles } from '../models/dbObjects';

// ── Config ────────────────────────────────────────────────────────────────────

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.token;
const GROK_KEY = process.env.GROK_API_KEY;

if (!BOT_TOKEN) {
	console.error('Missing env var: token');
	process.exit(1);
}
if (!GROK_KEY) {
	console.error('Missing env var: GROK_API_KEY');
	process.exit(1);
}

const grok = new OpenAI({ apiKey: GROK_KEY, baseURL: 'https://api.x.ai/v1' });

// ── Arg parsing ───────────────────────────────────────────────────────────────

function arg(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const channelId = arg('--channel');
const daysBack = parseInt(arg('--days') ?? '30', 10);
const dryRun = process.argv.includes('--dry-run');

if (!channelId) {
	console.error('Usage: npm run seed-profiles -- --channel <channelId> [--days <n>] [--dry-run]');
	process.exit(1);
}

// ── Discord REST helpers ───────────────────────────────────────────────────────

interface DiscordMessage {
	id: string;
	content: string;
	author: { id: string; username: string; bot?: boolean };
	timestamp: string;
	referenced_message?: DiscordMessage | null;
	message_reference?: { message_id?: string };
}

async function fetchMessages(channel: string, before?: string): Promise<DiscordMessage[]> {
	const params = new URLSearchParams({ limit: '100' });
	if (before) params.set('before', before);

	const res = await fetch(`${DISCORD_API}/channels/${channel}/messages?${params}`, {
		headers: { Authorization: `Bot ${BOT_TOKEN}` },
	});

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

// ── Scrape channel history ────────────────────────────────────────────────────

async function scrapeChannel(channel: string, sinceMs: number): Promise<DiscordMessage[]> {
	const all: DiscordMessage[] = [];
	let before: string | undefined;
	let fetched = 0;

	process.stdout.write('Fetching messages');
	for (;;) {
		const batch = await fetchMessages(channel, before);
		if (batch.length === 0) break;

		// Discord returns newest-first; oldest message in batch is last
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

		// Polite rate-limit pause
		await new Promise(r => setTimeout(r, 500));
	}

	console.log(` done (${fetched} fetched, ${all.length} within window).`);
	return all;
}

// ── Pair user prompts with bot responses ──────────────────────────────────────

interface Exchange {
	userMessage: string;
	botResponse: string;
}

function pairExchanges(
	messages: DiscordMessage[],
	botId: string,
): Map<string, { username: string; exchanges: Exchange[] }> {
	// Messages arrive newest-first from Discord; sort oldest-first for pairing
	const sorted = [...messages].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);

	const byUser = new Map<string, { username: string; exchanges: Exchange[] }>();

	for (let i = 0; i < sorted.length; i++) {
		const msg = sorted[i];
		if (msg.author.bot) continue;

		const lower = msg.content.toLowerCase().trim();
		if (!lower.startsWith('ai ') && lower !== 'ai') continue;

		// Find the next bot message after this one (within 5 messages)
		let botReply: DiscordMessage | undefined;
		for (let j = i + 1; j < Math.min(i + 6, sorted.length); j++) {
			if (sorted[j].author.id === botId) {
				botReply = sorted[j];
				break;
			}
		}
		if (!botReply) continue;

		const userId = msg.author.id;
		if (!byUser.has(userId)) {
			byUser.set(userId, { username: msg.author.username, exchanges: [] });
		}

		const promptText = msg.content.replace(/^ai\s*/i, '').trim();
		byUser.get(userId)!.exchanges.push({
			userMessage: promptText,
			botResponse: botReply.content,
		});
	}

	return byUser;
}

// ── Generate profile notes via Grok ──────────────────────────────────────────

async function generateNotes(username: string, exchanges: Exchange[]): Promise<string> {
	// Take up to 10 most recent exchanges to stay within token budget
	const recent = exchanges.slice(-10);
	const transcript = recent
		.map(e => `${username}: ${e.userMessage}\nbot: ${e.botResponse}`)
		.join('\n\n');

	const response = await grok.chat.completions.create({
		model: 'grok-4.20-0309-non-reasoning',
		max_tokens: 150,
		messages: [
			{
				role: 'system',
				content: 'You are a memory assistant for a Discord bot. Based on this user\'s chat history, write 2-3 concise notes about their interests, personality, or patterns. Be specific and factual. Output only the notes, nothing else.',
			},
			{
				role: 'user',
				content: `Username: ${username}\n\nChat history:\n${transcript}`,
			},
		],
	});

	return response.choices[0]?.message?.content?.trim() ?? '';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	const sinceMs = Date.now() - daysBack * 24 * 60 * 60 * 1000;

	console.log(`\nseeding profiles from #${channelId}`);
	console.log(`looking back ${daysBack} days (since ${new Date(sinceMs).toDateString()})`);
	if (dryRun) console.log('DRY RUN — no DB writes\n');

	const botId = await fetchBotId();
	const messages = await scrapeChannel(channelId, sinceMs);
	const byUser = pairExchanges(messages, botId);

	if (byUser.size === 0) {
		console.log('No "ai <message>" exchanges found in this window.');
		return;
	}

	console.log(`\nFound ${byUser.size} user(s) with ai interactions:\n`);

	for (const [userId, { username, exchanges }] of byUser) {
		console.log(`  ${username} (${userId}) — ${exchanges.length} exchange(s)`);

		if (exchanges.length < 2) {
			console.log('    → skipping (fewer than 2 exchanges, not enough signal)\n');
			continue;
		}

		process.stdout.write('    → generating notes...');
		const notes = await generateNotes(username, exchanges);
		console.log(' done');
		console.log(`    notes: ${notes}\n`);

		if (!dryRun) {
			await (UserProfiles as any).upsert({
				user_id: userId,
				notes,
				interaction_count: exchanges.length,
				last_updated: new Date(),
			});
			console.log('    → saved to DB\n');
		}

		// Polite pause between Grok calls
		await new Promise(r => setTimeout(r, 500));
	}

	console.log(dryRun ? 'Dry run complete.' : 'Done. Profiles seeded.');
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
