import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';

describe('Chess State Management', () => {
  let chess;

  beforeEach(() => {
    chess = new Chess();
  });

  it('initializes with standard starting position', () => {
    expect(chess.fen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(chess.turn()).toBe('w');
    expect(chess.isGameOver()).toBe(false);
  });

  it('executes valid pawn moves and updates board state', () => {
    const move = chess.move({ from: 'e2', to: 'e4' });
    expect(move).toBeTruthy();
    expect(move.san).toBe('e4');
    expect(chess.turn()).toBe('b');
  });

  it('rejects illegal moves', () => {
    expect(() => chess.move({ from: 'e2', to: 'e5' })).toThrow();
  });

  it('supports kingside castling', () => {
    chess.move('e4');
    chess.move('e5');
    chess.move('Nf3');
    chess.move('Nc6');
    chess.move('Bc4');
    chess.move('Bc5');
    const castleMove = chess.move('O-O');
    expect(castleMove).toBeTruthy();
    expect(castleMove.san).toBe('O-O');
    expect(castleMove.flags).toContain('k');
  });

  it('supports en passant captures correctly', () => {
    // 1. e4 a6 2. e5 d5 3. exd6
    chess.move('e4');
    chess.move('a6');
    chess.move('e5');
    chess.move('d5');
    const epMove = chess.move('exd6');
    expect(epMove).toBeTruthy();
    expect(epMove.flags).toContain('e');
    expect(chess.get('d5')).toBeFalsy(); // Captured pawn removed
  });

  it('handles pawn promotion', () => {
    // Setup a pawn one step from promotion
    chess.load('8/4P3/8/8/8/8/8/k6K w - - 0 1');
    const promo = chess.move({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(promo).toBeTruthy();
    expect(promo.promotion).toBe('q');
    expect(chess.get('e8').type).toBe('q');
  });

  it('detects checkmate', () => {
    // Scholar's Mate: 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
    chess.move('e4');
    chess.move('e5');
    chess.move('Qh5');
    chess.move('Nc6');
    chess.move('Bc4');
    chess.move('Nf6');
    chess.move('Qxf7#');

    expect(chess.isCheckmate()).toBe(true);
    expect(chess.isGameOver()).toBe(true);
  });

  it('detects stalemate', () => {
    // Fast stalemate position
    chess.load('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
    expect(chess.isStalemate()).toBe(true);
    expect(chess.isGameOver()).toBe(true);
  });
});
