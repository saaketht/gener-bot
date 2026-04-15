import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenAI before importing the handler
vi.mock('openai', () => {
	const generate = vi.fn().mockResolvedValue({ data: [{ url: 'https://example.com/img.png' }] });
	class MockOpenAI {
		images = { generate };
	}
	return { default: MockOpenAI };
});

// Mock rateLimiter
vi.mock('../../utils/rateLimiter', () => ({
	rateLimiter: vi.fn().mockReturnValue(true),
}));

import aiImage from './ai-image';
import { rateLimiter } from '../../utils/rateLimiter';

function fakeMessage(content: string, bot = false) {
	return {
		content,
		author: { bot, id: '123', username: 'testuser' },
		channel: {
			isSendable: () => true,
			sendTyping: vi.fn(),
		},
		reply: vi.fn(),
	} as any;
}

beforeEach(() => {
	vi.clearAllMocks();
	(rateLimiter as any).mockReturnValue(true);
});

describe('ai-image', () => {
	it('ignores messages that do not start with "ai-image "', async () => {
		const msg = fakeMessage('hello');
		await aiImage.execute(msg);
		expect(msg.reply).not.toHaveBeenCalled();
	});

	it('ignores bot messages', async () => {
		const msg = fakeMessage('ai-image a cat', true);
		await aiImage.execute(msg);
		expect(msg.reply).not.toHaveBeenCalled();
	});

	it('replies with usage when prompt is empty', async () => {
		const msg = fakeMessage('ai-image ');
		await aiImage.execute(msg);
		expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
	});

	it('replies with rate limit message when rate limited', async () => {
		(rateLimiter as any).mockReturnValue(false);
		const msg = fakeMessage('ai-image a cat');
		await aiImage.execute(msg);
		expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('rate limited'));
	});

	it('calls Grok API and replies with image URL on success', async () => {
		const msg = fakeMessage('ai-image a cat');
		await aiImage.execute(msg);
		expect(msg.channel.sendTyping).toHaveBeenCalled();
		expect(msg.reply).toHaveBeenCalledWith('https://example.com/img.png');
	});
});
