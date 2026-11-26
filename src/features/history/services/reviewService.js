// Game Review & Deep Analysis Service
// Analyzes completed chess games ply-by-ply using Stockfish, generates contextual move classifications,
// CAPS accuracy ratings, momentum evaluation graph, and identifies key turning points.

import { Chess } from 'chess.js';
import { EnginePool, StockfishEngine } from '../../analysis/engine/StockfishEngine';
import {
  classifyMove,
  calculateAccuracy,
  scoreToWhiteCp,
  formatEvaluation,
  calculateCpLoss,
  cpToWinChance,
  MOVE_CLASSES
} from '../../analysis/services/classifier';
import { generateMoveExplanation as buildExplanation } from '../../analysis/services/explanationService';
import { identifyOpening } from '../../../services/openings/openingBook';
import { historyStorage } from './historyStorage';

/**
 * Contextual explanation helper
 */
export function generateMoveExplanation({
  classification,
  san,
  bestSan,
  cpLoss,
  preEval,
  postEval,
  turn,
  isGameOver,
  isCheckmate
}) {
  const player = turn === 'w' ? 'White' : 'Black';
  const opponent = turn === 'w' ? 'Black' : 'White';
  const classId = classification?.id;

  if (isCheckmate) {
    return `${player} delivers checkmate with ${san}! A decisive finish.`;
  }

  switch (classId) {
    case 'brilliant':
      return `Outstanding sacrifice! ${san} gives up material to break open the position and seize a winning tactical assault.`;

    case 'great':
      return `${san} is a subtle, high-impact resource found under pressure. It keeps ${player} strictly on the path to victory.`;

    case 'best':
      return `${san} is the engine's primary recommendation, optimizing piece coordination and active board control.`;

    case 'excellent':
      return `${san} is a very strong alternative to ${bestSan || 'the best move'}, maintaining ${player}'s positional grip.`;

    case 'good':
      return `A solid and logical continuation. The game remains dynamically contested.`;

    case 'book':
      return `Following established opening theory, preparing center expansion and rapid piece development.`;

    case 'inaccuracy':
      return `${san} allows ${opponent} slight counterplay. ${bestSan ? `Preferring ${bestSan} would have preserved greater pressure.` : 'There were tighter positional options.'}`;

    case 'mistake':
      return `${san} is a notable error that squanders ${player}'s advantage (${(cpLoss / 100).toFixed(1)} pawns lost). The engine preferred ${bestSan || 'a better square'} to maintain defense.`;

    case 'blunder':
      return `A severe blunder. ${san} overlooks tactical danger or material loss. ${bestSan ? `The correct move was ${bestSan}.` : 'This drastically changes the evaluation in favor of the opponent.'}`;

    case 'miss':
    case 'missed_win':
      return `A missed opportunity! ${player} had a decisive breakthrough with ${bestSan || 'the best continuation'}, but ${san} overlooks the tactic or fails to punish the opponent's mistake.`;

    case 'forced':
      return `The only legal move on the board to escape check or resolve the attack.`;

    case 'interesting':
      return `${san} is an enterprising and speculative choice creating practical tactical complications.`;

    default:
      return `${player} plays ${san}.`;
  }
}

/**
 * Identifies significant momentum shifts and key turning points in a game.
 */
export function findTurningPoints(analyzedMoves = []) {
  const turningPoints = [];

  for (let i = 0; i < analyzedMoves.length; i++) {
    const move = analyzedMoves[i];
    const isBlunder = move.classification?.id === 'blunder';
    const isMistake = move.classification?.id === 'mistake';
    const isMiss = move.classification?.id === 'miss' || move.classification?.id === 'missed_win';
    const isBrilliant = move.classification?.id === 'brilliant';
    const isGreat = move.classification?.id === 'great';
    const hugeSwing = move.cpLoss >= 150 || (move.winChanceLoss !== undefined && move.winChanceLoss >= 15);

    if (isBlunder || isMiss || isBrilliant || (hugeSwing && (isMistake || isGreat))) {
      turningPoints.push({
        ply: move.ply,
        moveNumber: Math.floor((move.ply - 1) / 2) + 1,
        turn: move.turn,
        san: move.san,
        classification: move.classification,
        explanation: move.explanation,
        cpLoss: move.cpLoss,
        winChanceLoss: move.winChanceLoss,
        fenAfter: move.fenAfter
      });
    }
  }

  return turningPoints;
}

/**
 * Runs full game analysis move-by-move.
 * Analyzes root pre-move FEN and post-move FEN using Stockfish.
 */
export async function analyzeFullGame({
  pgn,
  moves = [],
  gameId = null,
  depth = 12,
  onProgress = () => {},
  engine = null
}) {
  const reviewWorker = engine || EnginePool.reviewEngine || new StockfishEngine('review');
  await reviewWorker.init();

  const chess = new Chess();
  let moveObjects = [];

  // Replay moves from PGN or raw moves
  if (pgn) {
    try {
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });
      chess.reset();
      moveObjects = history;
    } catch (e) {
      moveObjects = moves;
    }
  } else {
    moveObjects = moves;
  }

  const totalMoves = moveObjects.length;
  const analyzedMoves = [];
  const evalHistory = [];

  // Start position eval
  evalHistory.push({
    ply: 0,
    san: 'Start',
    fen: chess.fen(),
    cp: 0,
    winChance: 50,
    turn: 'w'
  });

  let prevEngineEval = { cp: 20 }; // neutral starting eval
  const sanHistoryList = [];

  for (let i = 0; i < totalMoves; i++) {
    const m = moveObjects[i];
    const ply = i + 1;
    const turn = chess.turn(); // 'w' | 'b'
    const moveNum = Math.floor(i / 2) + 1;
    const fenBefore = chess.fen();

    // 1. Evaluate root position before the move
    let rootEvalResult = null;
    try {
      rootEvalResult = await reviewWorker.evaluatePosition(fenBefore, { depth });
    } catch (err) {
      rootEvalResult = {
        bestMove: null,
        evaluation: prevEngineEval || { cp: 0 }
      };
    }

    const engineBestUci = rootEvalResult.bestMove;
    let engineBestSan = null;
    if (engineBestUci) {
      try {
        const tempC = new Chess(fenBefore);
        const from = engineBestUci.slice(0, 2);
        const to = engineBestUci.slice(2, 4);
        const promotion = engineBestUci.length > 4 ? engineBestUci[4] : undefined;
        const executed = tempC.move({ from, to, promotion });
        if (executed) engineBestSan = executed.san;
      } catch (e) {}
    }

    // 2. Play the move on our authoritative chess.js instance
    let moveRes = null;
    try {
      if (typeof m === 'string') {
        moveRes = chess.move(m);
      } else if (m.from && m.to) {
        moveRes = chess.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
      } else if (m.san) {
        moveRes = chess.move(m.san);
      }
    } catch (err) {
      console.warn(`[ReviewService] Error applying move ${JSON.stringify(m)}:`, err);
    }

    const fenAfter = chess.fen();
    const isGameOver = chess.isGameOver();
    const isCheckmate = chess.isCheckmate();
    const playedSan = moveRes ? moveRes.san : m.san || '';
    sanHistoryList.push(playedSan);

    // 3. Evaluate resulting position after the move
    let postEvalResult = null;
    if (isCheckmate) {
      const mateCp = turn === 'w' ? 30000 : -30000;
      postEvalResult = {
        evaluation: { mate: 0, cp: mateCp },
        score: { type: 'mate', value: 0 },
        cp: mateCp
      };
    } else {
      try {
        postEvalResult = await reviewWorker.evaluatePosition(fenAfter, { depth });
      } catch (e) {
        postEvalResult = {
          evaluation: { cp: 0 }
        };
      }
    }

    const preScore = rootEvalResult?.evaluation || prevEngineEval;
    const postScore = postEvalResult?.evaluation || { cp: 0 };
    prevEngineEval = postScore;

    const preCp = scoreToWhiteCp(preScore);
    const postCp = scoreToWhiteCp(postScore);
    const cpLoss = calculateCpLoss(preCp, postCp, turn);
    const winChance = cpToWinChance(postCp);

    // 4. Check opening book
    const openingInfo = identifyOpening(sanHistoryList);
    const isBook = openingInfo.isBookMove && i < 16;

    // 5. Classify the move
    const legalCount = new Chess(fenBefore).moves().length;
    const classificationObj = classifyMove({
      playedMove: moveRes || m,
      engineBestMove: engineBestUci || engineBestSan,
      preEval: preScore,
      postEval: postScore,
      turn,
      isBook,
      legalMovesCount: legalCount,
      chessBefore: new Chess(fenBefore),
      chessAfter: new Chess(fenAfter)
    });

    // 6. Generate contextual explanation
    const explanation = generateMoveExplanation({
      classification: classificationObj.classification,
      san: playedSan,
      bestSan: engineBestSan,
      cpLoss,
      preEval: preScore,
      postEval: postScore,
      turn,
      isGameOver,
      isCheckmate
    });

    const analyzedRecord = {
      ply,
      moveNumber: moveNum,
      turn,
      san: playedSan,
      uci: moveRes ? `${moveRes.from}${moveRes.to}${moveRes.promotion || ''}` : '',
      piece: moveRes?.piece || m.piece,
      captured: moveRes?.captured || m.captured,
      fenBefore,
      fenAfter,
      preScore,
      postScore,
      preCp,
      postCp,
      cpLoss,
      winChanceLoss: classificationObj.winChanceLoss,
      winChance,
      classification: classificationObj.classification,
      bestMove: engineBestSan || engineBestUci,
      explanation,
      isBook,
      opening: openingInfo.opening
    };

    analyzedMoves.push(analyzedRecord);

    evalHistory.push({
      ply,
      san: playedSan,
      fen: fenAfter,
      cp: postCp,
      winChance,
      turn,
      classification: classificationObj.classification,
      isCheckmate
    });

    if (typeof onProgress === 'function') {
      try {
        onProgress({
          currentPly: ply,
          totalPlies: totalMoves,
          currentMove: playedSan,
          percent: Math.round((ply / totalMoves) * 100)
        });
      } catch (e) {}
    }
  }

  // Calculate player accuracies
  const whiteMoves = analyzedMoves.filter((m) => m.turn === 'w');
  const blackMoves = analyzedMoves.filter((m) => m.turn === 'b');

  const whiteAccuracy = calculateAccuracy(whiteMoves);
  const blackAccuracy = calculateAccuracy(blackMoves);

  // Opening summary
  const openingResult = identifyOpening(sanHistoryList);
  const turningPoints = findTurningPoints(analyzedMoves);

  // Move breakdown tally
  const buildBreakdown = (movesSubset) => {
    const tally = {
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      book: 0,
      forced: 0,
      inaccuracy: 0,
      mistake: 0,
      miss: 0,
      blunder: 0
    };

    for (const m of movesSubset) {
      const id = m.classification?.id;
      if (id && tally[id] !== undefined) {
        tally[id] += 1;
      }
    }
    return tally;
  };

  const finalReview = {
    gameId,
    analyzedMoves,
    evalHistory,
    whiteAccuracy,
    blackAccuracy,
    whiteBreakdown: buildBreakdown(whiteMoves),
    blackBreakdown: buildBreakdown(blackMoves),
    opening: openingResult.opening,
    eco: openingResult.eco,
    openingName: openingResult.name,
    turningPoints,
    reviewedAt: Date.now()
  };

  // If gameId was provided, persist the review into storage automatically
  if (gameId) {
    historyStorage.saveGameReview(gameId, finalReview).catch(() => {});
  }

  return finalReview;
}

export default {
  analyzeFullGame,
  generateMoveExplanation,
  findTurningPoints
};
