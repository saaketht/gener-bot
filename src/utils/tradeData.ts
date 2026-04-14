import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export const CSV_PATH = process.env.PNL_CSV_PATH
	|| join(homedir(), 'rh-trade-exporter', 'outputs', 'spy_trades.csv');

export async function readTradesCSV(): Promise<string> {
	return readFile(CSV_PATH, 'utf-8');
}
