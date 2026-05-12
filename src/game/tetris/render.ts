import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { BOARD_H, BOARD_W, GameState, colorOf, getShape, ghostY } from './engine';

const ESC = '';
const RESET = `${ESC}[0m`;

const COLOR_CODES: Record<number, string> = {
	1: `${ESC}[1;36m`,
	2: `${ESC}[1;33m`,
	3: `${ESC}[1;35m`,
	4: `${ESC}[1;32m`,
	5: `${ESC}[1;31m`,
	6: `${ESC}[1;34m`,
	7: `${ESC}[1;37m`,
};

const GHOST = `${ESC}[2;30m`;
const EMPTY = `${ESC}[2;30m`;
const BORDER = `${ESC}[2;37m`;
const RED = `${ESC}[1;31m`;
const GREEN = `${ESC}[1;32m`;
const WHITE = `${ESC}[1;37m`;

const BLOCK = '██';
const GHOST_BLOCK = '▒▒';
const EMPTY_CELL = '··';

function renderBoard(state: GameState): string {
	const grid: number[][] = state.board.map(r => r.slice());
	const piece = state.piece;
	const gy = ghostY(state);
	const shape = getShape(piece.type, piece.rot);
	const pieceColor = colorOf(piece.type);
	const ghostMask: { x: number; y: number }[] = [];
	const liveMask: { x: number; y: number }[] = [];

	for (let dy = 0; dy < shape.length; dy++) {
		for (let dx = 0; dx < shape[dy].length; dx++) {
			if (!shape[dy][dx]) continue;
			const gx = piece.x + dx;
			const gyy = gy + dy;
			if (gyy >= 0 && gyy < BOARD_H) ghostMask.push({ x: gx, y: gyy });
			const py = piece.y + dy;
			if (py >= 0 && py < BOARD_H) liveMask.push({ x: gx, y: py });
		}
	}

	const lines: string[] = [];
	lines.push(BORDER + '┌' + '─'.repeat(BOARD_W * 2) + '┐' + RESET);

	for (let y = 0; y < BOARD_H; y++) {
		let row = BORDER + '│' + RESET;
		for (let x = 0; x < BOARD_W; x++) {
			const isLive = liveMask.some(m => m.x === x && m.y === y);
			const isGhost = !isLive && ghostMask.some(m => m.x === x && m.y === y);
			const v = grid[y][x];
			if (isLive) row += COLOR_CODES[pieceColor] + BLOCK + RESET;
			else if (isGhost) row += GHOST + GHOST_BLOCK + RESET;
			else if (v) row += COLOR_CODES[v] + BLOCK + RESET;
			else row += EMPTY + EMPTY_CELL + RESET;
		}
		row += BORDER + '│' + RESET;
		lines.push(row);
	}

	lines.push(BORDER + '└' + '─'.repeat(BOARD_W * 2) + '┘' + RESET);
	return lines.join('\n');
}

function renderNext(state: GameState): string {
	const shape = getShape(state.next, 0);
	const color = COLOR_CODES[colorOf(state.next)];
	const w = 4;
	const h = 2;
	const lines: string[] = [];
	for (let y = 0; y < h; y++) {
		let row = '';
		for (let x = 0; x < w; x++) {
			const cell = shape[y]?.[x];
			row += cell ? color + BLOCK + RESET : EMPTY + EMPTY_CELL + RESET;
		}
		lines.push(row);
	}
	return lines.join('\n');
}

export function renderEmbed(state: GameState): EmbedBuilder {
	const board = renderBoard(state);
	const next = renderNext(state);
	const status = state.gameOver ? RED + 'GAME OVER' + RESET : GREEN + 'PLAYING' + RESET;
	const stats = [
		status,
		'',
		WHITE + 'SCORE' + RESET + '  ' + state.score,
		WHITE + 'LINES' + RESET + '  ' + state.lines,
		WHITE + 'LEVEL' + RESET + '  ' + state.level,
		'',
		WHITE + 'NEXT' + RESET,
		next,
	].join('\n');

	const body = '```ansi\n' + board + '\n```';
	const side = '```ansi\n' + stats + '\n```';

	return new EmbedBuilder()
		.setColor(state.gameOver ? 0xff4444 : 0x5865f2)
		.setTitle('Tetris')
		.setDescription(body)
		.addFields({ name: '​', value: side, inline: true })
		.setFooter({ text: state.gameOver ? 'press New Game to play again' : `player: ${state.ownerId}` });
}

export function renderButtons(state: GameState): ActionRowBuilder<ButtonBuilder>[] {
	const disabled = state.gameOver;
	const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId('tetris_rotCCW').setLabel('↺').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('tetris_left').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('tetris_soft').setLabel('▼').setStyle(ButtonStyle.Primary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('tetris_right').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(disabled),
		new ButtonBuilder().setCustomId('tetris_rotCW').setLabel('↻').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
	);
	const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId('tetris_hard').setLabel('⤓ Hard Drop').setStyle(ButtonStyle.Success).setDisabled(disabled),
		new ButtonBuilder().setCustomId('tetris_new').setLabel('New Game').setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId('tetris_quit').setLabel('Quit').setStyle(ButtonStyle.Danger),
	);
	return [row1, row2];
}
