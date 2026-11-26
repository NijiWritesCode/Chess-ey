import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { identifyOpening } from '../services/openings/openingBook';

describe('Opening Recognition & ECO Database', () => {
  it('recognizes Italian Game Giuoco Piano', () => {
    const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'];
    const res = identifyOpening(moves);
    expect(res.eco).toMatch(/C5/);
    expect(res.name).toContain('Italian');
    expect(res.isBookMove).toBe(true);
  });

  it('recognizes Sicilian Defense Najdorf', () => {
    const moves = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    const res = identifyOpening(moves);
    expect(res.eco).toBe('B90');
    expect(res.name).toContain('Najdorf');
    expect(res.isBookMove).toBe(true);
  });

  it('recognizes French Defense Advance Variation', () => {
    const moves = ['e4', 'e6', 'd4', 'd5', 'e5'];
    const res = identifyOpening(moves);
    expect(res.eco).toBe('C02');
    expect(res.name).toContain('French');
    expect(res.isBookMove).toBe(true);
  });

  it('recognizes Queen\'s Gambit Declined', () => {
    const moves = ['d4', 'd5', 'c4', 'e6'];
    const res = identifyOpening(moves);
    expect(res.eco).toBe('D30');
    expect(res.name).toContain('Queen\'s Gambit');
    expect(res.isBookMove).toBe(true);
  });

  it('recognizes transpositions through FEN lookup', () => {
    // English Opening transposing to Queen's Gambit Declined: 1. c4 e6 2. d4 d5
    const c = new Chess();
    c.move('c4');
    c.move('e6');
    c.move('d4');
    c.move('d5');
    const res = identifyOpening(['c4', 'e6', 'd4', 'd5'], c.fen());
    expect(res.isBookMove).toBe(true);
    expect(res.name).toContain('Queen\'s Gambit');
  });

  it('detects when move sequence goes out of book and records departure ply', () => {
    const weirdMoves = ['e4', 'h5', 'd4', 'a5'];
    const res = identifyOpening(weirdMoves);
    expect(res.isBookMove).toBe(false);
    expect(res.bookDeparturePly).toBe(1);

    const completelyUnknown = ['h4', 'h5'];
    const resUnknown = identifyOpening(completelyUnknown);
    expect(resUnknown.isBookMove).toBe(false);
    expect(resUnknown.name).toContain('Unorthodox');
  });
});
