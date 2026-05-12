export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export const BOARD_W = 10;
export const BOARD_H = 20;

export interface Piece {
	type: PieceType;
	rot: number;
	x: number;
	y: number;
}

export interface GameState {
	board: number[][];
	piece: Piece;
	next: PieceType;
	score: number;
	lines: number;
	level: number;
	gameOver: boolean;
	ownerId: string;
	createdAt: number;
	lastMove: number;
}

const TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const COLOR_IDX: Record<PieceType, number> = {
	I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7,
};

const BASE_SHAPES: Record<PieceType, number[][]> = {
	I: [[1, 1, 1, 1]],
	O: [[1, 1], [1, 1]],
	T: [[0, 1, 0], [1, 1, 1]],
	S: [[0, 1, 1], [1, 1, 0]],
	Z: [[1, 1, 0], [0, 1, 1]],
	J: [[1, 0, 0], [1, 1, 1]],
	L: [[0, 0, 1], [1, 1, 1]],
};

function rotateMatrix(m: number[][]): number[][] {
	const h = m.length;
	const w = m[0].length;
	const out: number[][] = [];
	for (let x = 0; x < w; x++) {
		const row: number[] = [];
		for (let y = h - 1; y >= 0; y--) row.push(m[y][x]);
		out.push(row);
	}
	return out;
}

const SHAPES: Record<PieceType, number[][][]> = (() => {
	const out: Record<string, number[][][]> = {};
	for (const t of TYPES) {
		const rots: number[][][] = [BASE_SHAPES[t]];
		for (let i = 0; i < 3; i++) rots.push(rotateMatrix(rots[i]));
		out[t] = rots;
	}
	return out as Record<PieceType, number[][][]>;
})();

export function getShape(type: PieceType, rot: number): number[][] {
	const r = SHAPES[type];
	return r[((rot % r.length) + r.length) % r.length];
}

export function colorOf(type: PieceType): number {
	return COLOR_IDX[type];
}

function randomType(): PieceType {
	return TYPES[Math.floor(Math.random() * TYPES.length)];
}

function emptyBoard(): number[][] {
	return Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(0));
}

function spawnPiece(type: PieceType): Piece {
	const shape = getShape(type, 0);
	const x = Math.floor((BOARD_W - shape[0].length) / 2);
	return { type, rot: 0, x, y: 0 };
}

export function newGame(ownerId: string): GameState {
	const first = randomType();
	return {
		board: emptyBoard(),
		piece: spawnPiece(first),
		next: randomType(),
		score: 0,
		lines: 0,
		level: 1,
		gameOver: false,
		ownerId,
		createdAt: Date.now(),
		lastMove: Date.now(),
	};
}

export function collides(board: number[][], piece: Piece): boolean {
	const shape = getShape(piece.type, piece.rot);
	for (let dy = 0; dy < shape.length; dy++) {
		for (let dx = 0; dx < shape[dy].length; dx++) {
			if (!shape[dy][dx]) continue;
			const x = piece.x + dx;
			const y = piece.y + dy;
			if (x < 0 || x >= BOARD_W || y >= BOARD_H) return true;
			if (y >= 0 && board[y][x]) return true;
		}
	}
	return false;
}

function merge(board: number[][], piece: Piece): number[][] {
	const next = board.map(r => r.slice());
	const shape = getShape(piece.type, piece.rot);
	const c = colorOf(piece.type);
	for (let dy = 0; dy < shape.length; dy++) {
		for (let dx = 0; dx < shape[dy].length; dx++) {
			if (shape[dy][dx] && piece.y + dy >= 0) next[piece.y + dy][piece.x + dx] = c;
		}
	}
	return next;
}

function clearLines(board: number[][]): { board: number[][]; cleared: number } {
	const kept = board.filter(row => row.some(c => !c));
	const cleared = BOARD_H - kept.length;
	while (kept.length < BOARD_H) kept.unshift(Array(BOARD_W).fill(0));
	return { board: kept, cleared };
}

const LINE_SCORE = [0, 100, 300, 500, 800];

function lockAndAdvance(state: GameState): void {
	state.board = merge(state.board, state.piece);
	const { board, cleared } = clearLines(state.board);
	state.board = board;
	if (cleared > 0) {
		state.score += LINE_SCORE[cleared] * state.level;
		state.lines += cleared;
		state.level = Math.floor(state.lines / 10) + 1;
	}
	const nextPiece = spawnPiece(state.next);
	state.next = randomType();
	state.piece = nextPiece;
	if (collides(state.board, state.piece)) state.gameOver = true;
}

export type Action = 'left' | 'right' | 'rotCW' | 'rotCCW' | 'soft' | 'hard';

export function applyAction(state: GameState, action: Action): boolean {
	if (state.gameOver) return false;
	state.lastMove = Date.now();
	const p = state.piece;

	if (action === 'left' || action === 'right') {
		const dx = action === 'left' ? -1 : 1;
		const moved = { ...p, x: p.x + dx };
		if (!collides(state.board, moved)) state.piece = moved;
		return true;
	}

	if (action === 'rotCW' || action === 'rotCCW') {
		const dr = action === 'rotCW' ? 1 : -1;
		const rotated = { ...p, rot: p.rot + dr };
		for (const kick of [0, -1, 1, -2, 2]) {
			const tryP = { ...rotated, x: rotated.x + kick };
			if (!collides(state.board, tryP)) {
				state.piece = tryP;
				return true;
			}
		}
		return true;
	}

	if (action === 'soft') {
		const moved = { ...p, y: p.y + 1 };
		if (!collides(state.board, moved)) {
			state.piece = moved;
			state.score += 1;
		}
		else {
			lockAndAdvance(state);
		}
		return true;
	}

	if (action === 'hard') {
		let dropped = 0;
		while (!collides(state.board, { ...state.piece, y: state.piece.y + 1 })) {
			state.piece = { ...state.piece, y: state.piece.y + 1 };
			dropped++;
		}
		state.score += dropped * 2;
		lockAndAdvance(state);
		return true;
	}

	return false;
}

export function ghostY(state: GameState): number {
	let y = state.piece.y;
	while (!collides(state.board, { ...state.piece, y: y + 1 })) y++;
	return y;
}
