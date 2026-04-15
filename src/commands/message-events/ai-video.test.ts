import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock rateLimiter
vi.mock('../../utils/rateLimiter', () => ({
	rateLimiter: vi.fn().mockReturnValue(true),
}));

import aiVideo from './ai-video';
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
	vi.unstubAllGlobals();
	vi.useFakeTimers();
	(rateLimiter as any).mockReturnValue(true);
});

describe('ai-video', () => {
	it('ignores messages that do not start with "ai-video "', async () => {
		const msg = fakeMessage('hello');
		await aiVideo.execute(msg);
		expect(msg.reply).not.toHaveBeenCalled();
	});

	it('ignores bot messages', async () => {
		const msg = fakeMessage('ai-video a cat', true);
		await aiVideo.execute(msg);
		expect(msg.reply).not.toHaveBeenCalled();
	});

	it('replies with usage when prompt is empty', async () => {
		const msg = fakeMessage('ai-video ');
		await aiVideo.execute(msg);
		expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
	});

	it('replies with rate limit message when rate limited', async () => {
		(rateLimiter as any).mockReturnValue(false);
		const msg = fakeMessage('ai-video a cat');
		await aiVideo.execute(msg);
		expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('rate limited'));
	});

	it('submits generation and replies with video URL on success', async () => {
		vi.stubGlobal('fetch', vi.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ request_id: 'req_123' }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ status: 'done', video: { url: 'https://example.com/vid.mp4' } }),
			}),
		);

		const msg = fakeMessage('ai-video a cat');
		const promise = aiVideo.execute(msg);
		// Advance past the poll interval setTimeout
		await vi.advanceTimersByTimeAsync(6000);
		await promise;
		expect(msg.reply).toHaveBeenCalledWith('https://example.com/vid.mp4');
	});

	it('replies with error message when submit fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			text: () => Promise.resolve('Internal Server Error'),
		}));

		const msg = fakeMessage('ai-video a cat');
		const promise = aiVideo.execute(msg);
		await vi.advanceTimersByTimeAsync(1000);
		await promise;
		expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('something went wrong'));
	});
});
