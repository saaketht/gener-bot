import { Client, EmbedBuilder } from 'discord.js';
import { MessageEvent } from '../../types';
import logger from '../../utils/logger';

const ARCHIVE_URL = 'https://ix.cnn.io/data/truth-social/truth_archive.json';
const CACHE_TTL = 30 * 60 * 1000;

interface TruthPost {
	id: string;
	created_at: string;
	content: string;
	url: string;
	media: string[];
	replies_count: number;
	reblogs_count: number;
	favourites_count: number;
}

let cache: { posts: TruthPost[]; fetchedAt: number; etag: string } | null = null;

// Full-archive fetch — used by the `trump [n]` command for deep browsing.
async function fetchPosts(): Promise<TruthPost[]> {
	if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
		return cache.posts;
	}
	const headers: Record<string, string> = {};
	if (cache?.etag) headers['If-None-Match'] = cache.etag;
	// The archive is ~19MB (3.5MB gzipped) and can take a minute on a slow link —
	// cap it so a hung download fails fast; ETag makes unchanged polls near-free 304s.
	const res = await fetch(ARCHIVE_URL, { headers, signal: AbortSignal.timeout(90_000) });
	if (res.status === 304 && cache) {
		cache.fetchedAt = Date.now();
		return cache.posts;
	}
	if (!res.ok) throw new Error(`Truth Social archive returned ${res.status}`);
	const posts: TruthPost[] = await res.json();
	cache = { posts, fetchedAt: Date.now(), etag: res.headers.get('etag') ?? '' };
	return posts;
}

function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>\s*<p>/gi, '\n\n')
		.replace(/<a[^>]*href="([^"]*)"[^>]*>[^<]*<\/a>/gi, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, '\'')
		.replace(/&#x27;/g, '\'')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toString();
}

function buildEmbed(post: TruthPost, index: number): EmbedBuilder {
	const text = stripHtml(post.content);
	const description = text || '​';
	const timestamp = new Date(post.created_at);
	const stats = [
		`❤️ ${formatCount(post.favourites_count)}`,
		`🔁 ${formatCount(post.reblogs_count)}`,
		`💬 ${formatCount(post.replies_count)}`,
	].join('  ·  ');

	const embed = new EmbedBuilder()
		.setColor(0x1DA1F2)
		.setAuthor({
			name: 'Donald J. Trump',
			iconURL: 'https://pbs.twimg.com/profile_images/874276197357596672/kUuht00m_200x200.jpg',
			url: post.url,
		})
		.setDescription(description.length > 4096 ? description.slice(0, 4093) + '...' : description)
		.addFields({ name: 'Stats', value: stats })
		.setTimestamp(timestamp)
		.setFooter({ text: `Truth #${index} · Truth Social` });

	if (post.media.length > 0) {
		embed.setImage(post.media[0].replace('tmtg:', 'tmtg%3A'));
	}

	return embed;
}

const WATCH_POLL_MS = 10 * 60 * 1000;
const WATCH_MAX_PER_POLL = 3;
const WATCH_PARTIAL_BYTES = 64 * 1024;
let watchEtag = '';

// Watcher fetch: the archive is ~19MB but newest-first and the CDN honors Range
// requests, so pull only the first 64KB (~20 posts) and cut at the last complete
// top-level object. Returns null when the archive is unchanged (ETag 304).
// If the server ever ignores the Range and sends 200, the same parse still works.
async function fetchLatestPosts(): Promise<TruthPost[] | null> {
	const headers: Record<string, string> = { Range: `bytes=0-${WATCH_PARTIAL_BYTES - 1}` };
	if (watchEtag) headers['If-None-Match'] = watchEtag;
	const res = await fetch(ARCHIVE_URL, { headers, signal: AbortSignal.timeout(30_000) });
	if (res.status === 304) return null;
	if (!res.ok) throw new Error(`Truth Social archive returned ${res.status}`);
	watchEtag = res.headers.get('etag') ?? '';
	const text = await res.text();
	const cut = text.lastIndexOf('\n  }');
	if (cut < 0) throw new Error('no complete post in partial archive response');
	return JSON.parse(text.slice(0, cut + 4) + '\n]');
}

// Auto-post new Truth Social posts to the channel named by TRUMP_WATCH_CHANNEL_ID.
// No env var → no polling. Seeds the last-seen ID on first poll without posting,
// so restarts never replay old posts (downtime posts are skipped by design).
export function startTrumpWatcher(client: Client) {
	const channelId = process.env.TRUMP_WATCH_CHANNEL_ID;
	if (!channelId) {
		logger.info('trump watcher disabled (TRUMP_WATCH_CHANNEL_ID not set)');
		return;
	}

	let lastSeenId: string | null = null;
	const poll = async () => {
		try {
			const posts = await fetchLatestPosts();
			if (!posts || posts.length === 0) return;
			if (lastSeenId === null) {
				lastSeenId = posts[0].id;
				return;
			}

			const fresh: { post: TruthPost; index: number }[] = [];
			for (let i = 0; i < posts.length; i++) {
				if (posts[i].id === lastSeenId) break;
				fresh.push({ post: posts[i], index: i });
			}
			if (fresh.length === 0) return;
			lastSeenId = posts[0].id;

			const channel = await client.channels.fetch(channelId);
			if (!channel?.isSendable()) return;
			// oldest first, capped per poll
			for (const { post, index } of fresh.slice(0, WATCH_MAX_PER_POLL).reverse()) {
				await channel.send({ embeds: [buildEmbed(post, index)] });
			}
			logger.info(`trump watcher posted ${Math.min(fresh.length, WATCH_MAX_PER_POLL)} new post(s)`);
		}
		catch (err) {
			logger.warn('trump watcher poll failed:', err);
		}
	};

	poll();
	setInterval(poll, WATCH_POLL_MS);
	logger.info(`trump watcher enabled → channel ${channelId}, every ${WATCH_POLL_MS / 60000}min`);
}

const messageEvent: MessageEvent = {
	name: 'trump',
	async execute(message) {
		if (message.author.bot) return;
		const content = message.content.trim().toLowerCase();
		if (content !== 'trump' && !/^trump\s+\d+$/.test(content)) return;

		const parts = content.split(/\s+/);
		const offset = parts.length > 1 ? Math.max(0, parseInt(parts[1], 10)) : 0;

		try {
			if ('sendTyping' in message.channel) {
				message.channel.sendTyping();
			}

			const posts = await fetchPosts();
			if (offset >= posts.length) {
				message.reply(`Only ${posts.length.toLocaleString()} posts available. Try a lower number.`);
				return;
			}

			const post = posts[offset];
			const embed = buildEmbed(post, offset);
			message.reply({ embeds: [embed] });
		}
		catch (err) {
			logger.error('Trump handler error:', err);
			message.reply('Failed to fetch Truth Social post.');
		}
	},
};

export default messageEvent;
