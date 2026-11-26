import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  classifyMove,
  MOVE_CLASSES,
  formatEvaluation,
  calculateAccuracy,
  isPieceSacrifice
} from '../../features/analysis/services/classifier';
import { generateMoveExplanation } from '../../features/analysis/services/explanationService';

describe('Phase 3.4 & 3.5: Move Classifier & Contextual Explanations', () => {
  describe('Move Classification Rules', () => {
    it('classifies forced moves when only 1 legal move is available', () => {
      const result = classifyMove({
        playedMove: { from: 'g8', to: 'h8', san: 'Kh8' },
        engineBestMove: 'g8h8',
        preEval: { cp: -500 },
        postEval: { cp: -500 },
        turn: 'b',
        legalMovesCount: 1
      });

      expect(result.classification).toBe(MOVE_CLASSES.FORCED);
      expect(result.cpLoss).toBe(0);
    });

    it('classifies recognized opening moves as Book', () => {
      const result = classifyMove({
        playedMove: { from: 'e2', to: 'e4', san: 'e4' },
        engineBestMove: 'e2e4',
        preEval: { cp: 20 },
        postEval: { cp: 25 },
        turn: 'w',
        isBook: true
      });

      expect(result.classification).toBe(MOVE_CLASSES.BOOK);
      expect(result.isBook).toBe(true);
    });

    it('classifies engine top choice without sacrifice as Best', () => {
      const result = classifyMove({
        playedMove: { from: 'g1', to: 'f3', san: 'Nf3', piece: 'n' },
        engineBestMove: 'g1f3',
        preEval: { cp: 25 },
        postEval: { cp: 25 },
        turn: 'w'
      });

      expect(result.classification).toBe(MOVE_CLASSES.BEST);
    });

    it('classifies brilliant moves when a piece is sacrificed soundly in a winning position', () => {
      // White sacrifices a bishop on h7
      const board = new Chess('rnbq1rk1/ppp2ppp/4pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQ - 0 6');
      const result = classifyMove({
        playedMove: { from: 'd3', to: 'h7', san: 'Bxh7+', piece: 'b', captured: 'p', color: 'w' },
        engineBestMove: 'd3h7',
        preEval: { cp: 200 },
        postEval: { cp: 350 }, // White remains strongly winning
        turn: 'w',
        chessBefore: board
      });

      expect(result.classification).toBe(MOVE_CLASSES.BRILLIANT);
    });

    it('classifies severe mistakes as Blunders', () => {
      // White had +150 (winning pawn), plays move dropping to -400
      const result = classifyMove({
        playedMove: { from: 'd1', to: 'd8', san: 'Qxd8+' },
        engineBestMove: 'e1g1',
        preEval: { cp: 150 },
        postEval: { cp: -400 },
        turn: 'w'
      });

      expect(result.classification).toBe(MOVE_CLASSES.BLUNDER);
      expect(result.winChanceLoss).toBeGreaterThan(20);
    });

    it('classifies missed wins when dropping out of a decisive advantage', () => {
      // White was +600 (winChance > 85%), drops to +50 (winChance ~57%)
      const result = classifyMove({
        playedMove: { from: 'a1', to: 'b1', san: 'Rb1' },
        engineBestMove: 'h5h7',
        preEval: { cp: 600 },
        postEval: { cp: 50 },
        turn: 'w'
      });

      expect(result.classification).toBe(MOVE_CLASSES.MISS);
    });
  });

  describe('Contextual Explanation Generation', () => {
    it('generates checkmate announcement', () => {
      const explanation = generateMoveExplanation({
        move: { san: 'Qxf7#', to: 'f7', piece: 'q' },
        classification: MOVE_CLASSES.BEST
      });
      expect(explanation).toContain('checkmate');
    });

    it('generates brilliant sacrifice commentary', () => {
      const explanation = generateMoveExplanation({
        move: { san: 'Bxh7+', to: 'h7', piece: 'b', captured: 'p' },
        classification: MOVE_CLASSES.BRILLIANT
      });
      expect(explanation).toContain('brilliant tactical strike');
      expect(explanation).toContain('bishop');
    });

    it('generates blunder explanation with alternative recommendation', () => {
      const explanation = generateMoveExplanation({
        move: { san: 'Qe5', to: 'e5', piece: 'q' },
        classification: MOVE_CLASSES.BLUNDER,
        bestMoveSan: 'Nf3'
      });
      expect(explanation).toContain('blunder');
      expect(explanation).toContain('Nf3');
    });
  });

  describe('Accuracy Calculation and Formatting', () => {
    it('calculates game accuracy properly', () => {
      const perfectMoves = [
        { isBook: false, winChanceLoss: 0, classification: MOVE_CLASSES.BEST },
        { isBook: false, winChanceLoss: 0.5, classification: MOVE_CLASSES.EXCELLENT }
      ];
      expect(calculateAccuracy(perfectMoves)).toBeGreaterThan(98);

      const mixedMoves = [
        { isBook: true },
        { isBook: false, winChanceLoss: 1.0, classification: MOVE_CLASSES.EXCELLENT },
        { isBook: false, winChanceLoss: 25.0, classification: MOVE_CLASSES.BLUNDER }
      ];
      const acc = calculateAccuracy(mixedMoves);
      expect(acc).toBeLessThan(85);
      expect(acc).toBeGreaterThan(30);
    });

    it('formats evaluations into standard chess notation', () => {
      expect(formatEvaluation({ cp: 145 })).toBe('+1.45');
      expect(formatEvaluation({ cp: -80 })).toBe('-0.80');
      expect(formatEvaluation({ cp: 0 })).toBe('0.00');
      expect(formatEvaluation({ mate: 2 })).toBe('+M2');
      expect(formatEvaluation({ mate: -3 })).toBe('-M3');
      expect(formatEvaluation({ score: { type: 'mate', value: 1 } })).toBe('+M1');
    });
  });
});
