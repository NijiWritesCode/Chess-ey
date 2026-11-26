import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  classifyMove,
  calculateCpLoss,
  calculateAccuracy,
  scoreToWhiteCp,
  cpToWinChance,
  formatEvaluation,
  isPieceSacrifice,
  MOVE_CLASSES,
  ANALYSIS_STATES
} from '../services/analysis/classifier';

describe('Move Classification & Evaluation Logic', () => {
  it('converts centipawns and mate scores properly', () => {
    expect(scoreToWhiteCp({ cp: 150 })).toBe(150);
    expect(scoreToWhiteCp({ cp: -220 })).toBe(-220);
    expect(scoreToWhiteCp({ mate: 2 })).toBeGreaterThan(25000);
    expect(scoreToWhiteCp({ mate: -1 })).toBeLessThan(-25000);
    expect(scoreToWhiteCp({ mate: 0 })).toBe(0);
  });

  it('calculates win chance accurately with bounds', () => {
    expect(Math.round(cpToWinChance(0))).toBe(50);
    expect(cpToWinChance(1000)).toBeGreaterThan(90);
    expect(cpToWinChance(-1000)).toBeLessThan(10);
  });

  it('calculates centipawn loss from White perspective', () => {
    // White had +150, now +100 -> lost 50 cp
    expect(calculateCpLoss(150, 100, 'w')).toBe(50);
    // White had +150, now +200 -> gained eval (0 loss)
    expect(calculateCpLoss(150, 200, 'w')).toBe(0);
  });

  it('calculates centipawn loss from Black perspective', () => {
    // White had -200 (Black was +200), now White is -150 (Black is +150) -> Black lost 50 cp
    expect(calculateCpLoss(-200, -150, 'b')).toBe(50);
    // White had -200, now White is -250 (Black is +250) -> 0 loss
    expect(calculateCpLoss(-200, -250, 'b')).toBe(0);
  });

  it('correctly identifies genuine sacrifices vs ordinary development moves', () => {
    const c = new Chess();
    // 1. Nf3: standard minor piece development to unattacked square
    const nf3Move = { piece: 'n', from: 'g1', to: 'f3', color: 'w', san: 'Nf3' };
    expect(isPieceSacrifice(nf3Move, c)).toBe(false);

    // 1. Bc4: standard bishop development
    const bc4Move = { piece: 'b', from: 'f1', to: 'c4', color: 'w', san: 'Bc4' };
    expect(isPieceSacrifice(bc4Move, c)).toBe(false);

    // Greek gift sacrifice: Bxh7+ capturing pawn on h7 where King/pieces attack h7
    const greekGift = new Chess('rnbq1rk1/ppp2ppp/4pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQ - 0 6');
    const bxh7 = { piece: 'b', from: 'd3', to: 'h7', captured: 'p', color: 'w', san: 'Bxh7+' };
    expect(isPieceSacrifice(bxh7, greekGift)).toBe(true);

    // Exchange sacrifice: Rook takes knight (val 5 takes val 3, net -2)
    const exchangeSac = { piece: 'r', from: 'f3', to: 'c3', captured: 'n', color: 'w', san: 'Rxc3' };
    expect(isPieceSacrifice(exchangeSac)).toBe(true);
  });

  it('classifies forced moves when only 1 legal move exists', () => {
    const res = classifyMove({
      playedMove: { from: 'e1', to: 'e2', san: 'Ke2' },
      engineBestMove: 'e1e2',
      preEval: { cp: 0 },
      postEval: { cp: 0 },
      turn: 'w',
      legalMovesCount: 1
    });
    expect(res.classification.id).toBe(MOVE_CLASSES.FORCED.id);
    expect(res.state).toBe(ANALYSIS_STATES.ANALYSED);
  });

  it('classifies book moves', () => {
    const res = classifyMove({
      playedMove: { from: 'e2', to: 'e4', san: 'e4' },
      engineBestMove: 'e2e4',
      preEval: { cp: 20 },
      postEval: { cp: 20 },
      turn: 'w',
      isBook: true,
      legalMovesCount: 20
    });
    expect(res.classification.id).toBe(MOVE_CLASSES.BOOK.id);
  });

  it('classifies best and excellent moves', () => {
    const bestRes = classifyMove({
      playedMove: { from: 'e2', to: 'e4', san: 'e4' },
      engineBestMove: 'e2e4',
      preEval: { cp: 20 },
      postEval: { cp: 20 },
      turn: 'w',
      isBook: false
    });
    expect(bestRes.classification.id).toBe(MOVE_CLASSES.BEST.id);

    const excRes = classifyMove({
      playedMove: { from: 'c2', to: 'c4', san: 'c4' },
      engineBestMove: 'd2d4',
      preEval: { cp: 20 },
      postEval: { cp: 5 }, // 15 cp loss
      turn: 'w',
      isBook: false
    });
    expect(excRes.classification.id).toBe(MOVE_CLASSES.EXCELLENT.id);
    expect(excRes.classification.symbol).toBe('👍');
  });

  it('correctly maps all standardized Chess.com denotation symbols', () => {
    expect(MOVE_CLASSES.BRILLIANT.symbol).toBe('!!');
    expect(MOVE_CLASSES.GREAT.symbol).toBe('!');
    expect(MOVE_CLASSES.BEST.symbol).toBe('★');
    expect(MOVE_CLASSES.EXCELLENT.symbol).toBe('👍');
    expect(MOVE_CLASSES.GOOD.symbol).toBe('✔');
    expect(MOVE_CLASSES.BOOK.symbol).toBe('📖');
    expect(MOVE_CLASSES.FORCED.symbol).toBe('□');
    expect(MOVE_CLASSES.INTERESTING.symbol).toBe('!?');
    expect(MOVE_CLASSES.INACCURACY.symbol).toBe('?!');
    expect(MOVE_CLASSES.MISTAKE.symbol).toBe('?');
    expect(MOVE_CLASSES.MISS.symbol).toBe('❌');
    expect(MOVE_CLASSES.BLUNDER.symbol).toBe('??');
  });

  it('classifies great move when finding the only winning path ("Only-Move Rule")', () => {
    const greatRes = classifyMove({
      playedMove: { from: 'g1', to: 'f3', san: 'Nf3' },
      engineBestMove: 'g1f3',
      preEval: { cp: 0 },
      postEval: { cp: 0 },
      turn: 'w',
      isBook: false,
      legalMovesCount: 20,
      secondBestLoss: 150 // second best move is 1.5 pawns worse
    });
    expect(greatRes.classification.id).toBe(MOVE_CLASSES.GREAT.id);
    expect(greatRes.classification.symbol).toBe('!');
  });

  it('classifies inaccuracies, mistakes, and blunders', () => {
    const inacc = classifyMove({
      playedMove: { from: 'a2', to: 'a3', san: 'a3' },
      engineBestMove: 'd2d4',
      preEval: { cp: 20 },
      postEval: { cp: -60 }, // 80 cp loss
      turn: 'w',
      isBook: false
    });
    expect(inacc.classification.id).toBe(MOVE_CLASSES.INACCURACY.id);

    const mistake = classifyMove({
      playedMove: { from: 'g2', to: 'g4', san: 'g4' },
      engineBestMove: 'd2d4',
      preEval: { cp: 20 },
      postEval: { cp: -130 }, // 150 cp loss
      turn: 'w',
      isBook: false
    });
    expect(mistake.classification.id).toBe(MOVE_CLASSES.MISTAKE.id);

    const blunder = classifyMove({
      playedMove: { from: 'd1', to: 'h5', san: 'Qh5' },
      engineBestMove: 'd2d4',
      preEval: { cp: 50 },
      postEval: { cp: -400 }, // 450 cp loss
      turn: 'w',
      isBook: false
    });
    expect(blunder.classification.id).toBe(MOVE_CLASSES.BLUNDER.id);
  });

  it('classifies brilliant move when sacrifice preserves advantage', () => {
    const c = new Chess();
    const brilliantRes = classifyMove({
      playedMove: { piece: 'r', from: 'f3', to: 'c3', captured: 'n', san: 'Rxc3' },
      engineBestMove: 'f3c3',
      preEval: { cp: 200 },
      postEval: { cp: 200 },
      turn: 'w',
      isBook: false
    });
    expect(brilliantRes.classification.id).toBe(MOVE_CLASSES.BRILLIANT.id);
  });

  it('rejects brilliancy in runaway winning positions (Anti-Triviality Rule)', () => {
    // Up +8.00 beforehand: sacrificing material is showboating, classified as BEST, not BRILLIANT
    const runawayRes = classifyMove({
      playedMove: { piece: 'r', from: 'f3', to: 'c3', captured: 'n', san: 'Rxc3' },
      engineBestMove: 'f3c3',
      preEval: { cp: 800 },
      postEval: { cp: 800 },
      turn: 'w',
      isBook: false
    });
    expect(runawayRes.classification.id).toBe(MOVE_CLASSES.BEST.id);
  });

  it('does not classify simple queen pawn captures as sacrifices', () => {
    const qd5Move = { piece: 'q', from: 'd1', to: 'd5', captured: 'p', san: 'Qxd5' };
    expect(isPieceSacrifice(qd5Move)).toBe(false);

    const pawnCap = { piece: 'p', from: 'e4', to: 'd5', captured: 'p', san: 'exd5' };
    expect(isPieceSacrifice(pawnCap)).toBe(false);
  });

  it('classifies missed win correctly', () => {
    const missedWin = classifyMove({
      playedMove: { from: 'f1', to: 'e2', san: 'Be2' },
      engineBestMove: 'd1d8',
      preEval: { cp: 500 }, // Had decisive win +5.0
      postEval: { cp: 50 },  // Dropped to equal +0.50
      turn: 'w',
      isBook: false
    });
    expect(missedWin.classification.id).toBe(MOVE_CLASSES.MISSED_WIN.id);
  });

  it('calculates game accuracy accurately using calibrated CAPS formula', () => {
    // 0 win-loss moves should yield 100%
    const perfectMoves = [{ winChanceLoss: 0 }, { winChanceLoss: 0 }, { winChanceLoss: 0 }];
    expect(calculateAccuracy(perfectMoves)).toBe(100);

    // Minor inaccuracies (1-2% loss) should yield ~91-95%
    const solidMoves = [{ winChanceLoss: 1.5 }, { winChanceLoss: 0 }, { winChanceLoss: 2.0 }];
    const solidAcc = calculateAccuracy(solidMoves);
    expect(solidAcc).toBeGreaterThan(90);
    expect(solidAcc).toBeLessThan(100);

    // Big blunders (20-30% loss) should yield < 50%
    const blunderMoves = [{ winChanceLoss: 25 }, { winChanceLoss: 30 }, { winChanceLoss: 20 }];
    expect(calculateAccuracy(blunderMoves)).toBeLessThan(50);
  });

  it('formats evaluations properly for display', () => {
    expect(formatEvaluation({ cp: 45 })).toBe('+0.45');
    expect(formatEvaluation({ cp: -120 })).toBe('-1.20');
    expect(formatEvaluation({ mate: 3 })).toBe('+M3');
    expect(formatEvaluation({ mate: -2 })).toBe('-M2');
  });

  it('correctly scores terminal checkmate in scoreToWhiteCp without collapsing to 0', () => {
    // When White is delivering mate or White has won, mate is positive or cp is positive
    expect(scoreToWhiteCp({ mate: 0, cp: 30000 })).toBe(30000);
    // When Black delivers mate, cp is -30000
    expect(scoreToWhiteCp({ mate: 0, cp: -30000 })).toBe(-30000);
  });

  it('classifies brilliant moves correctly for Black without sign inversion flaws', () => {
    const brilliantBlack = classifyMove({
      playedMove: { piece: 'r', from: 'f6', to: 'c3', captured: 'n', san: 'Rxc3', color: 'b' },
      engineBestMove: 'f6c3',
      preEval: { cp: -250 }, // Black is up 2.5 pawns
      postEval: { cp: -250 },
      turn: 'b',
      isBook: false
    });
    expect(brilliantBlack.classification.id).toBe(MOVE_CLASSES.BRILLIANT.id);
  });

  it('classifies missed win correctly for Black when squandering decisive advantage', () => {
    const missedWinBlack = classifyMove({
      playedMove: { from: 'd8', to: 'e7', san: 'Qe7' },
      engineBestMove: 'd8h4',
      preEval: { cp: -500 }, // Black had decisive win -5.00
      postEval: { cp: 50 },  // Dropped to White +0.50
      turn: 'b',
      isBook: false
    });
    expect(missedWinBlack.classification.id).toBe(MOVE_CLASSES.MISS.id);
  });

  it('never classifies checkmating move as a blunder or miss', () => {
    const mateMove = classifyMove({
      playedMove: { from: 'd1', to: 'h5', san: 'Qh5#' },
      engineBestMove: 'd1h5',
      preEval: { cp: 900 },
      postEval: { mate: 0, cp: 30000 },
      turn: 'w',
      isBook: false
    });
    expect(mateMove.classification.id).toBe(MOVE_CLASSES.BEST.id);
  });
});
