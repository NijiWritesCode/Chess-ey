// Game Review & Deep Analysis Engine
// Analyzes completed games move-by-move with Stockfish, generates PVs, turning points, and human chess explanations.

import { Chess } from 'chess.js';
import { reviewEngine } from '../engine/stockfishService';
import { classifyMove, calculateAccuracy, scoreToWhiteCp, formatEvaluation, calculateCpLoss, cpToWinChance } from './classifier';
import { identifyOpening } from '../openings/openingBook';

/**
 * Generates an articulate, position-grounded chess explanation
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

    case 'interesting':
      return `${san} is an enterprising and speculative choice! While engine analysis finds tighter paths, this creates genuine practical complications.`;

    case 'forced':
      return `The only legal move on the board to escape check or resolve the attack.`;

    case 'only_move':
      return `The sole move to keep ${player} alive. Any other reply would have lost on the spot.`;

    default:
      return `${player} plays ${san}.`;
  }
}

/**
 * Runs full game analysis move by move with pre-move root evaluation
 */
export async function analyzeFullGame({
  pgn,
  moves = [],
  depth = 14,
  onProgress = () => {}
}) {
  const chess = new Chess();
  let moveObjects = [];

  // Replay moves from PGN or move history
  if (pgn) {
    try {
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });
      chess.reset();
      moveObjects = history;
    } catch (e) {
      console.warn('Failed to parse PGN, using raw moves array', e);
      moveObjects = moves;
    }
  } else {
    moveObjects = moves;
  }

  const totalMoves = moveObjects.length;
  const analyzedMoves = [];
  const whiteMoves = [];
  const blackMoves = [];
  const turningPoints = [];
  const evalHistory = [];

  chess.reset();
  const sansSoFar = [];

  // Initial evaluation for the starting position
  let currentPreEval = { cp: 20, depth: 10, pv: [] };
  evalHistory.push({
    moveNumber: 0,
    ply: 0,
    turn: 'w',
    san: 'Start',
    score: '+0.20',
    cp: 20,
    classification: null
  });

  for (let i = 0; i < totalMoves; i++) {
    const m = moveObjects[i];
    const turn = chess.turn();
    const fenBefore = chess.fen();
    const legalMovesCount = chess.moves().length;

    // Opening book check with FEN transposition
    sansSoFar.push(m.san);
    const openingInfo = identifyOpening(sansSoFar, fenBefore);

    // 1. EVALUATE PRE-MOVE ROOT POSITION (Player's turn)
    // This gives the authentic engine best move, score, and PV continuation from fenBefore
    let preEval = currentPreEval;
    let engineBestUci = null;
    let engineBestSan = null;
    let prePv = [];

    try {
      const preResult = await reviewEngine.evaluatePosition(fenBefore, {
        depth,
        movetime: 300
      });
      if (preResult) {
        if (preResult.evaluation) {
          preEval = preResult.evaluation;
        }
        engineBestUci = preResult.bestMove;
        prePv = preResult.evaluation?.pv || [];

        // Convert engine best UCI move to SAN on fenBefore
        if (engineBestUci && engineBestUci.length >= 4) {
          try {
            const tempChess = new Chess(fenBefore);
            const bestObj = tempChess.move({
              from: engineBestUci.slice(0, 2),
              to: engineBestUci.slice(2, 4),
              promotion: engineBestUci[4] || 'q'
            });
            if (bestObj) engineBestSan = bestObj.san;
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn(`Engine pre-eval failed for move ${i + 1}:`, err);
    }

    // 2. EXECUTE THE MOVE ON BOARD
    const playedMove = chess.move({
      from: m.from,
      to: m.to,
      promotion: m.promotion || 'q'
    });

    const fenAfter = chess.fen();
    const isGameOver = chess.isGameOver();
    const isCheckmate = chess.isCheckmate();

    // 3. EVALUATE RESULTING POSITION
    let postEval = { cp: 0, depth: 0, pv: [] };
    const playedUci = `${m.from}${m.to}`;
    const isTopChoice = engineBestUci && (engineBestUci === playedUci || engineBestSan === m.san);

    if (isTopChoice && preEval) {
      // If player played the engine's best move, evaluation stays consistent
      postEval = preEval;
    } else {
      try {
        const postResult = await reviewEngine.evaluatePosition(fenAfter, {
          depth: Math.max(6, depth - 2),
          movetime: 250
        });
        if (postResult?.evaluation) {
          postEval = postResult.evaluation;
        }
      } catch (err) {
        console.warn(`Engine post-eval failed for move ${i + 1}:`, err);
      }
    }

    // 4. CLASSIFY MOVE
    const prevMove = analyzedMoves[i - 1];
    const oppBlunderOnPrevTurn = Boolean(prevMove && ['blunder', 'mistake'].includes(prevMove.classification?.id));

    const classificationResult = classifyMove({
      playedMove: m,
      engineBestMove: engineBestSan || engineBestUci,
      preEval,
      postEval,
      turn,
      isBook: openingInfo.isBookMove,
      legalMovesCount,
      chessBefore: new Chess(fenBefore),
      chessAfter: new Chess(fenAfter),
      oppBlunderOnPrevTurn
    });

    const explanation = generateMoveExplanation({
      classification: classificationResult.classification,
      san: m.san,
      bestSan: engineBestSan,
      cpLoss: classificationResult.cpLoss,
      preEval,
      postEval,
      turn,
      isGameOver,
      isCheckmate
    });

    const analyzedMoveItem = {
      index: i,
      moveNumber: Math.floor(i / 2) + 1,
      ply: i + 1,
      turn,
      san: m.san,
      from: m.from,
      to: m.to,
      fenBefore,
      fenAfter,
      classification: classificationResult.classification,
      cpLoss: classificationResult.cpLoss,
      winChanceLoss: classificationResult.winChanceLoss,
      isBook: classificationResult.isBook,
      bestMoveSan: engineBestSan,
      bestMoveUci: engineBestUci,
      pv: prePv, // PV starting from fenBefore with engineBestUci!
      evalBefore: preEval,
      evalAfter: postEval,
      explanation
    };

    analyzedMoves.push(analyzedMoveItem);
    if (turn === 'w') whiteMoves.push(analyzedMoveItem);
    else blackMoves.push(analyzedMoveItem);

    // Track turning points (Blunders, Mistakes, Misses, Brilliancies)
    if (['blunder', 'mistake', 'missed_win', 'miss', 'brilliant'].includes(classificationResult.classification.id)) {
      turningPoints.push(analyzedMoveItem);
    }

    // Evaluation history for chart
    const whiteCp = scoreToWhiteCp(postEval);
    evalHistory.push({
      moveNumber: Math.floor(i / 2) + 1,
      ply: i + 1,
      turn,
      san: m.san,
      score: formatEvaluation(postEval, turn),
      cp: whiteCp,
      isMate: postEval.mate !== undefined && postEval.mate !== null,
      classification: classificationResult.classification
    });

    currentPreEval = postEval;

    // Report progress
    const percent = Math.round(((i + 1) / totalMoves) * 100);
    onProgress({
      current: i + 1,
      total: totalMoves,
      percent,
      latestMove: analyzedMoveItem
    });
  }

  // Calculate player accuracies using the calibrated CAPS win-loss formula
  const whiteAccuracy = calculateAccuracy(whiteMoves);
  const blackAccuracy = calculateAccuracy(blackMoves);

  // Overall opening info
  const gameOpening = identifyOpening(sansSoFar, chess.fen());

  // Summary counts
  const countWhite = countClassifications(whiteMoves);
  const countBlack = countClassifications(blackMoves);

  return {
    analyzedMoves,
    whiteMoves,
    blackMoves,
    turningPoints,
    evalHistory,
    whiteAccuracy,
    blackAccuracy,
    gameOpening,
    stats: {
      white: countWhite,
      black: countBlack
    }
  };
}

function countClassifications(moveList = []) {
  const counts = {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    miss: 0,
    missed_win: 0,
    forced: 0,
    interesting: 0,
    only_move: 0
  };

  for (const m of moveList) {
    const id = m.classification?.id;
    if (id && counts[id] !== undefined) {
      counts[id]++;
      if (id === 'miss') counts.missed_win++;
      else if (id === 'missed_win') counts.miss++;
    }
  }

  return counts;
}
