import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { historyStorage } from '../../features/history/services/historyStorage';
import {
  analyzeFullGame,
  generateMoveExplanation,
  findTurningPoints
} from '../../features/history/services/reviewService';

class MockReviewWorker {
  constructor() {
    this.onmessage = null;
    this.currentFen = null;
  }

  postMessage(cmd) {
    if (cmd === 'uci') {
      setTimeout(() => {
        this.onmessage?.({ data: 'id name Stockfish Review' });
        this.onmessage?.({ data: 'uciok' });
      }, 5);
      return;
    }
    if (cmd === 'isready') {
      setTimeout(() => {
        this.onmessage?.({ data: 'readyok' });
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
        let cp = 25;
        if (fen.includes('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR')) {
          move = 'e7e5';
          cp = 30;
        } else if (fen.includes('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR')) {
          // Qxf7# position
          move = 'h5f7';
          cp = 30000;
        }
        this.onmessage?.({ data: `info depth 10 score cp ${cp} pv ${move}` });
        this.onmessage?.({ data: `bestmove ${move}` });
      }, 10);
      return;
    }
  }

  terminate() {}
}

describe('Phase 4: Game Persistence and Full Review System', () => {
  let originalWorker;

  beforeEach(async () => {
    localStorage.clear();
    await historyStorage.clearGames();
    originalWorker = global.Worker;
    global.Worker = MockReviewWorker;
  });

  afterEach(() => {
    global.Worker = originalWorker;
  });

  describe('4.1 & 4.2: Game Persistence & Local History', () => {
    it('saves a completed game record and retrieves it by ID', async () => {
      const record = {
        id: 'game_test_401',
        gameMode: 'computer',
        timestamp: Date.now(),
        players: {
          white: { name: 'Player' },
          black: { name: 'Stockfish Level 4' }
        },
        result: { winner: 'w', reason: 'checkmate', pgnResult: '1-0' },
        initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        finalFen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
        moves: [
          { san: 'e4', from: 'e2', to: 'e4' },
          { san: 'e5', from: 'e7', to: 'e5' }
        ],
        pgn: '1. e4 e5'
      };

      await historyStorage.saveGame(record);
      const retrieved = await historyStorage.getGameById('game_test_401');

      expect(retrieved).toBeTruthy();
      expect(retrieved.id).toBe('game_test_401');
      expect(retrieved.gameMode).toBe('computer');
      expect(retrieved.result.winner).toBe('w');
      expect(retrieved.moves.length).toBe(2);
    });

    it('retrieves recent games in reverse-chronological order and filters by gameMode', async () => {
      const g1 = { id: 'g_old', timestamp: 1000, gameMode: 'computer', pgn: '1. d4' };
      const g2 = { id: 'g_new', timestamp: 2000, gameMode: 'multiplayer', pgn: '1. e4' };
      const g3 = { id: 'g_latest', timestamp: 3000, gameMode: 'computer', pgn: '1. c4' };

      await historyStorage.saveGame(g1);
      await historyStorage.saveGame(g2);
      await historyStorage.saveGame(g3);

      const all = await historyStorage.getRecentGames(10);
      expect(all.length).toBe(3);
      expect(all[0].id).toBe('g_latest');
      expect(all[1].id).toBe('g_new');
      expect(all[2].id).toBe('g_old');

      const computerOnly = await historyStorage.getRecentGames(10, 'computer');
      expect(computerOnly.length).toBe(2);
      expect(computerOnly.map((g) => g.id)).toEqual(['g_latest', 'g_old']);
    });

    it('attaches review metadata to a stored game', async () => {
      const g = { id: 'g_review_test', timestamp: Date.now(), pgn: '1. e4 e5' };
      await historyStorage.saveGame(g);

      const reviewData = {
        whiteAccuracy: 92.5,
        blackAccuracy: 88.0,
        eco: 'C20',
        openingName: "King's Pawn Game"
      };

      await historyStorage.saveGameReview('g_review_test', reviewData);

      const retrievedReview = await historyStorage.getGameReview('g_review_test');
      expect(retrievedReview).toBeTruthy();
      expect(retrievedReview.whiteAccuracy).toBe(92.5);
      expect(retrievedReview.openingName).toBe("King's Pawn Game");

      const gameWithReview = await historyStorage.getGameById('g_review_test');
      expect(gameWithReview.review).toBeTruthy();
      expect(gameWithReview.review.whiteAccuracy).toBe(92.5);
    });

    it('deletes games cleanly from storage', async () => {
      const g = { id: 'g_delete_me', timestamp: Date.now(), pgn: '1. e4' };
      await historyStorage.saveGame(g);

      await historyStorage.deleteGame('g_delete_me');
      const found = await historyStorage.getGameById('g_delete_me');
      expect(found).toBeNull();
    });
  });

  describe('4.3: Full Game Review Analysis Service', () => {
    it('analyzes full game move by move and generates eval history and accuracies', async () => {
      const pgn = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#';
      const reviewResult = await analyzeFullGame({
        pgn,
        depth: 10
      });

      expect(reviewResult).toBeTruthy();
      expect(reviewResult.analyzedMoves.length).toBe(7);
      expect(reviewResult.evalHistory.length).toBe(8); // Start + 7 plies
      expect(reviewResult.whiteAccuracy).toBeGreaterThanOrEqual(0);
      expect(reviewResult.whiteAccuracy).toBeLessThanOrEqual(100);
      expect(reviewResult.blackAccuracy).toBeGreaterThanOrEqual(0);
      expect(reviewResult.blackAccuracy).toBeLessThanOrEqual(100);

      // Verify final move is Qxf7# checkmate
      const finalMove = reviewResult.analyzedMoves[6];
      expect(finalMove.san).toBe('Qxf7#');
      expect(finalMove.explanation).toContain('checkmate');
    });

    it('identifies key turning points in analyzed moves', () => {
      const mockAnalyzed = [
        {
          ply: 1,
          turn: 'w',
          san: 'e4',
          cpLoss: 0,
          winChanceLoss: 0,
          classification: { id: 'best' }
        },
        {
          ply: 2,
          turn: 'b',
          san: 'g5',
          cpLoss: 250,
          winChanceLoss: 22,
          classification: { id: 'blunder' },
          explanation: 'Severe blunder',
          fenAfter: 'fen_b'
        },
        {
          ply: 3,
          turn: 'w',
          san: 'Qh5#',
          cpLoss: 0,
          winChanceLoss: 0,
          classification: { id: 'brilliant' },
          explanation: 'Brilliant finish',
          fenAfter: 'fen_c'
        }
      ];

      const turningPoints = findTurningPoints(mockAnalyzed);
      expect(turningPoints.length).toBe(2);
      expect(turningPoints[0].classification.id).toBe('blunder');
      expect(turningPoints[1].classification.id).toBe('brilliant');
    });

    it('generates contextual explanations for all classifications', () => {
      const explanation = generateMoveExplanation({
        classification: { id: 'mistake' },
        san: 'f6',
        bestSan: 'Nf6',
        cpLoss: 150,
        turn: 'b'
      });

      expect(explanation).toContain('f6');
      expect(explanation).toContain('Nf6');
    });
  });
});
