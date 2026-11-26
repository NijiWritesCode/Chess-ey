import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { analyzeFullGame, generateMoveExplanation } from '../services/analysis/reviewService';
import { reviewEngine } from '../services/engine/stockfishService';

class MockReviewWorker {
  constructor() {
    this.onmessage = null;
    this.currentFen = null;
  }

  postMessage(cmd) {
    if (cmd === 'uci') {
      setTimeout(() => {
        this.onmessage({ data: 'id name Stockfish Review' });
        this.onmessage({ data: 'uciok' });
      }, 5);
      return;
    }
    if (cmd === 'isready') {
      setTimeout(() => {
        this.onmessage({ data: 'readyok' });
      }, 5);
      return;
    }
    if (cmd.startsWith('position fen ')) {
      this.currentFen = cmd.replace('position fen ', '');
      return;
    }
    if (cmd.startsWith('go')) {
      setTimeout(() => {
        const fen = this.currentFen || '';
        let move = 'e2e4';
        if (fen.includes('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR')) {
          move = 'e7e5';
        }
        this.onmessage({ data: 'info depth 10 score cp 20 pv ' + move });
        this.onmessage({ data: 'bestmove ' + move });
      }, 10);
      return;
    }
  }

  terminate() {}
}

describe('Phase 2: Review Service Acceptance & Accuracy', () => {
  let originalWorker;

  beforeEach(() => {
    originalWorker = global.Worker;
    global.Worker = MockReviewWorker;
  });

  afterEach(() => {
    global.Worker = originalWorker;
    reviewEngine.terminate();
  });

  it('generates move explanations for all classification categories', () => {
    const brilliantExp = generateMoveExplanation({
      classification: { id: 'brilliant' },
      san: 'Bxh7+',
      bestSan: 'Bxh7+',
      cpLoss: 0,
      turn: 'w'
    });
    expect(brilliantExp).toContain('sacrifice');

    const blunderExp = generateMoveExplanation({
      classification: { id: 'blunder' },
      san: 'Qe7',
      bestSan: 'Nf6',
      cpLoss: 400,
      turn: 'b'
    });
    expect(blunderExp).toContain('blunder');
  });

  it('runs full game analysis on a short game and reports accuracies and stats', async () => {
    // 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# (Scholar's Mate)
    const pgn = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#';
    
    const analysis = await analyzeFullGame({
      pgn,
      depth: 10
    });

    expect(analysis).toBeDefined();
    expect(analysis.analyzedMoves.length).toBe(7);
    expect(analysis.whiteAccuracy).toBeGreaterThanOrEqual(0);
    expect(analysis.whiteAccuracy).toBeLessThanOrEqual(100);
    expect(analysis.blackAccuracy).toBeGreaterThanOrEqual(0);
    expect(analysis.blackAccuracy).toBeLessThanOrEqual(100);
    expect(analysis.evalHistory.length).toBe(8); // Start + 7 moves
    
    // Checkmate move Qxf7# should have decisive evaluation and not be a miss or blunder
    const mateMove = analysis.analyzedMoves[6];
    expect(mateMove.san).toBe('Qxf7#');
    expect(['best', 'brilliant', 'great']).toContain(mateMove.classification.id);
  });
});
