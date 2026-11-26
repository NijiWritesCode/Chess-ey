// Unified High-Level Analysis Service
// Orchestrates Stockfish position evaluation, move classification, and natural explanation generation.

import { analysisEngine, reviewEngine } from '../engine/StockfishEngine';
import { classifyMove, MOVE_CLASSES, formatEvaluation } from './classifier';
import { generateMoveExplanation } from './explanationService';
import { identifyOpening } from '../../../services/openings/openingBook';
import { Chess } from 'chess.js';

/**
 * Evaluates a single FEN position using the analysis engine.
 */
export async function evaluatePosition(fen, options = {}) {
  return analysisEngine.evaluatePosition(fen, {
    depth: options.depth || 14,
    movetime: options.movetime || 500,
    timeout: options.timeout || 5000,
    onProgress: options.onProgress
  });
}

/**
 * Analyzes a played move by comparing position before and position after against engine calculations.
 *
 * @param {Object} params
 * @param {string} params.fenBefore
 * @param {string} params.fenAfter
 * @param {Object} params.move - { from, to, promotion, san, piece, captured }
 * @param {string} params.turn - 'w' | 'b'
 * @param {number} [params.depth=12]
 * @param {Object} [params.preEval] - optional cached evaluation before move
 * @param {Object} [params.postEval] - optional cached evaluation after move
 * @param {boolean} [params.isBook=false]
 * @param {StockfishEngine} [params.engine=analysisEngine]
 * @returns {Promise<Object>} Complete move analysis payload
 */
export async function analyzeMove({
  fenBefore,
  fenAfter,
  move,
  turn,
  depth = 12,
  preEval = null,
  postEval = null,
  isBook = false,
  engine = analysisEngine
}) {
  let chessBefore = null;
  let chessAfter = null;

  try {
    chessBefore = new Chess(fenBefore);
    chessAfter = new Chess(fenAfter);
  } catch (e) {}

  const legalMovesCount = chessBefore ? chessBefore.moves().length : 20;

  // 1. Evaluate position before move if not provided
  let evalBefore = preEval;
  let engineBestMove = null;

  if (!evalBefore) {
    try {
      const res = await engine.evaluatePosition(fenBefore, { depth, movetime: 400 });
      evalBefore = res;
      engineBestMove = res.bestMove;
    } catch (e) {
      evalBefore = { score: { type: 'cp', value: 0 }, cp: 0, depth: 0, status: 'error' };
    }
  } else {
    engineBestMove = evalBefore.bestMove || null;
  }

  // 2. Evaluate position after move if not provided
  let evalAfter = postEval;
  if (!evalAfter) {
    try {
      evalAfter = await engine.evaluatePosition(fenAfter, { depth, movetime: 400 });
    } catch (e) {
      evalAfter = { score: { type: 'cp', value: 0 }, cp: 0, depth: 0, status: 'error' };
    }
  }

  // 3. Convert best move UCI to SAN if chessBefore is available
  let bestMoveSan = null;
  if (engineBestMove && chessBefore) {
    try {
      const moveFrom = engineBestMove.slice(0, 2);
      const moveTo = engineBestMove.slice(2, 4);
      const promo = engineBestMove.length >= 5 ? engineBestMove[4] : 'q';
      const m = chessBefore.move({ from: moveFrom, to: moveTo, promotion: promo });
      if (m) {
        bestMoveSan = m.san;
        chessBefore.undo();
      }
    } catch (e) {}
  }

  // 4. Opening recognition
  let opening = null;
  try {
    opening = identifyOpening([move.san], fenAfter);
  } catch (e) {}

  // 5. Classify move
  const classificationResult = classifyMove({
    playedMove: move,
    engineBestMove,
    preEval: evalBefore,
    postEval: evalAfter,
    turn,
    isBook: isBook || (opening && opening.isBookMove),
    legalMovesCount,
    chessBefore,
    chessAfter
  });

  // 6. Generate natural language explanation
  const explanation = generateMoveExplanation({
    move,
    classification: classificationResult.classification,
    bestMoveSan,
    preEval: evalBefore,
    postEval: evalAfter,
    turn,
    opening,
    principalVariation: evalAfter.principalVariation || []
  });

  return {
    move,
    turn,
    fenBefore,
    fenAfter,
    classification: classificationResult.classification,
    cpLoss: classificationResult.cpLoss,
    winChanceLoss: classificationResult.winChanceLoss,
    isBook: classificationResult.isBook,
    evalBefore,
    evalAfter,
    bestMove: engineBestMove,
    bestMoveSan,
    explanation,
    opening,
    pv: evalAfter.principalVariation || []
  };
}

export default {
  evaluatePosition,
  analyzeMove,
  formatEvaluation
};
