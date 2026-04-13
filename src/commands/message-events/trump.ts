import { EmbedBuilder } from 'discord.js';
import { MessageEvent } from '../../types';
import logger from '../../utils/logger';

const ARCHIVE_URL = 'https://ix.cnn.io/data/truth-social/truth_archive.json';
const CACHE_TTL = 5 * 60 * 1000;

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

let cache: { posts: TruthPost[]; fetchedAt: number } | null = null;

async function fetchPosts(): Promise<TruthPost[]> {
	if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
		return cache.posts;
	}
	const res = await fetch(ARCHIVE_URL);
	if (!res.ok) throw new Error(`Truth Social archive returned ${res.status}`);
	const posts: TruthPost[] = await res.json();
	cache = { posts, fetchedAt: Date.now() };
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
	const description = text || (post.media.length > 0 ? '*[Media]*' : '*[No content]*');
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
		embed.setImage(post.media[0]);
	}

	return embed;
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
