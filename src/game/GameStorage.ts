import fs from 'fs';
import path from 'path';
import { GameState } from './types';
import logger from '../utils/logger';

export class GameStorage {
	private storageDir: string;

	constructor(storageDir: string) {
		this.storageDir = storageDir;
		this.ensureStorageDir();
	}

	private ensureStorageDir(): void {
		try {
			fs.mkdirSync(this.storageDir, { recursive: true });
		} catch (error) {
			logger.error('Failed to create storage directory:', error);
		}
	}

	saveGame(state: GameState): void {
		const filepath = path.join(this.storageDir, `${state.threadId}.json`);
		try {
			fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
		} catch (error) {
			logger.error('Failed to save game:', error);
			throw error;
		}
	}

	loadGame(threadId: string): GameState | null {
		const filepath = path.join(this.storageDir, `${threadId}.json`);
		try {
			const data = fs.readFileSync(filepath, 'utf-8');
			return JSON.parse(data) as GameState;
		} catch (error: any) {
			if (error.code === 'ENOENT') return null;
			if (error instanceof SyntaxError) {
				logger.warn(`Corrupted save file, deleting: ${filepath}`);
				try { fs.unlinkSync(filepath); } catch { /* ignore */ }
				return null;
			}
			logger.error('Failed to load game:', error);
			throw error;
		}
	}

	deleteGame(threadId: string): void {
		const filepath = path.join(this.storageDir, `${threadId}.json`);
		try {
			fs.unlinkSync(filepath);
		} catch (error: any) {
			if (error.code !== 'ENOENT') {
				logger.error('Failed to delete game:', error);
			}
		}
	}

	listGames(): string[] {
		try {
			return fs.readdirSync(this.storageDir)
				.filter(f => f.endsWith('.json'))
				.map(f => f.replace('.json', ''));
		} catch {
			return [];
		}
	}
}
